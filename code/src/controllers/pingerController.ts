/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import type * as express from "express";
import { logger } from "../common/global";
import { InternalServerError, Json, OK, ServiceUnavailable } from "../dodsonlabs/HttpConstants";
import { ensureError } from "../dodsonlabs/SystemFunctions";
import { z } from "zod";
import type { MqttNetworking } from "../dodsonlabs/MqttNetworking";
import { MqttBrokerUnavailableError, mqtt_command_get_messages } from "./sensorController";

// ---- IP Pinger analysis types

export interface LiveSensor {
    source: string;
    payload?: {
        data?: {
            network?: {
                ip_address?: string;
            };
        };
    };
}

export interface IppingerDevice {
    source: string;
    "ip-address": string;
}

export interface AnalyzeResultBase {
    state: string;
    "state-value": Record<string, string>;
}

// Runtime validation for the ip-pinger /read-config response. fetchItOnly()
// only guarantees a 2xx response that parsed as JSON — not the schema. A
// partially upgraded or incompatible ip-pinger can return HTTP 200 with a
// body that lacks `devices` or has malformed entries; that data is treated
// as "unavailable" by the caller.
//
// Current ip-pinger builds return camelCase `ipAddress`; older builds used
// kebab-case `ip-address`. Accept both and normalize to the internal
// kebab-case key.
const ippingerDeviceSchema = z.object({
    source: z.string(),
    ipAddress: z.string().optional(),
    "ip-address": z.string().optional(),
}).refine(
    d => d.ipAddress !== undefined || d["ip-address"] !== undefined,
    { message: "missing ipAddress" }
);

const ippingerConfigSchema = z.object({
    devices: z.array(ippingerDeviceSchema),
});

// ---- private functions

/**
 * Wrapper around native fetch() with an AbortSignal timeout.
 * Throws an AbortError when the timeout fires, which callers
 * catch and translate to HTTP 502.
 */
async function fetchWithTimeout(
    url: string,
    timeoutMs: number,
    init?: RequestInit
): Promise<Response> {
    const signal = AbortSignal.timeout(timeoutMs);
    return fetch(url, { ...init, signal });
}

async function fetchItOnly(originator: string, url: string, timeoutMs: number): Promise<unknown | null> {
    const origin = `${originator}/fetchItOnly`;

    try {
        const response = await fetchWithTimeout(url, timeoutMs);
        if (!response.ok) {
            logger()?.write_warn(origin, `Url=${url}, Status=${response.status}`);
            return null;
        }

        const data = await response.json();
        logger()?.write_debug(origin, `Url=${url}, Data=${JSON.stringify(data)}`);
        return data;

    } catch (error) {
        logger()?.write_error(origin, `Url=${url}, Error=${error}`);
        return null;
    }
}

export function createAnalyzeResult<T extends LiveSensor | IppingerDevice>(
    state: string,
    state_value: Record<string, string>,
    origin: T
): AnalyzeResultBase & T {
    return { ...origin, state, "state-value": state_value } as AnalyzeResultBase & T;
}

export function analyzeIt(
    live_sensors: LiveSensor[],
    ippinger_devices: IppingerDevice[],
    case_sensitive: boolean
): AnalyzeResultBase[] {
    // For each config device: find matching live sensor by source (then IP).
    // Then scan for live sensors with no matching config entry (New).
    // States: OK, IP Address Mismatch, Name Mismatch, Offline, New

    // init
    const results: AnalyzeResultBase[] = [];

    // process each device defined in the IP Pinger configuration
    ippinger_devices.forEach(device => {
        const source = String(device["source"]);
        const ip_address = String(device["ip-address"]);

        // find source in live_sensors
        let sensor: LiveSensor | undefined;
        if (case_sensitive) {
            sensor = live_sensors.find(x => { return x["source"] === source; });
        } else {
            sensor = live_sensors.find(x => { return x["source"].toLowerCase() === source.toLowerCase(); });
        }

        // check
        if (sensor) {
            // init
            // V3 get-details: the IP lives at payload.data.network.ip_address
            const sensor_ipaddress = String(sensor?.payload?.data?.network?.ip_address ?? "");

            // check if ip-addresses are equal
            if (sensor_ipaddress === ip_address) {
                // state: OK
                results.push(createAnalyzeResult("OK", { "sensor": "", "config": "" }, sensor));

            } else {
                // state: IP Address Mismatch
                results.push(createAnalyzeResult("IP Address Mismatch", { "sensor": sensor_ipaddress, "config": ip_address }, sensor));
            }

        } else {
            // check if device.ip-address is-in livesensors
            const sensor_ip: LiveSensor | undefined = live_sensors.find(x => { return x?.payload?.data?.network?.ip_address === ip_address; });
            if (sensor_ip) {
                // init
                const sensor_source = String(sensor_ip["source"]);

                // state: Name Mismatch
                results.push(createAnalyzeResult("Name Mismatch", { "sensor": sensor_source, "config": source }, sensor_ip));

            } else {
                // state: Offline
                results.push(createAnalyzeResult("Offline", { "sensor": "", "config": "" }, device));
            }
        }
    });

    // process each device defined in the IP Pinger configuration
    live_sensors.forEach(sensor => {
        const source = sensor["source"];
        // V3 get-details: the IP lives at payload.data.network.ip_address
        const ip_address = sensor?.payload?.data?.network?.ip_address;

        // check if live_sensor.source is in ippinger-devices
        let dude: IppingerDevice | undefined;
        if (case_sensitive) {
            dude = ippinger_devices.find(x => { return x["source"] === source; });
        } else {
            dude = ippinger_devices.find(x => { return x["source"].toLowerCase() === source.toLowerCase(); });
        }
        if (!dude) {
            const dude_2 = ippinger_devices.find(x => { return x["ip-address"] === ip_address; });
            if (!dude_2) {
                // state: New
                results.push(createAnalyzeResult("New", { "sensor": "", "config": "" }, sensor));
            }
        }
    });

    // ----
    return results;
}

/**
 * Fetch live sensors via MQTT. Responds directly and returns null when the
 * broker is unavailable (503 — mqtt_command_get_messages now rejects instead
 * of publishing into a disconnected client) or on any other failure (500),
 * so the caller never has to handle a reject this high up the chain.
 */
async function fetch_live_sensors(network: MqttNetworking, res: express.Response): Promise<LiveSensor[] | null> {
    try {
        const { dude: commandControl, results } = await mqtt_command_get_messages(network, "*", "get-details");
        commandControl.clear_results();
        return results as LiveSensor[];
    } catch (err) {
        const error = ensureError(err);
        if (error instanceof MqttBrokerUnavailableError) {
            logger()?.write_warn("pingerController.ts/getAnalyzeIpPinger", `MQTT broker unavailable — cannot fetch live sensors: ${error.message}`);
            res.status(ServiceUnavailable).json({ error: error.message });
        } else {
            logger()?.write_error("pingerController.ts/getAnalyzeIpPinger", `Failed to fetch live sensors: ${error.message}`);
            res.status(InternalServerError).json({ error: error.message });
        }
        return null;
    }
}

export async function getAnalyzeIpPinger(_req: express.Request, res: express.Response, network: MqttNetworking, ip_pinger_web_api: string, case_sensitive: boolean, timeoutMs: number) {
    // read configuration from ip-pinger first — fast path, fails quickly on error
    const url = `${ip_pinger_web_api}/read-config`;
    const ippingerConfig = await fetchItOnly("getAnalyzeIpPinger", url, timeoutMs);

    // Validate the upstream response at the boundary instead of casting it.
    // An unchecked `as { devices: IppingerDevice[] }` let `undefined`/`null`
    // reach analyzeIt() (TypeError in the async handler), and Express 4 does
    // not catch handler rejections — the process-level unhandledRejection
    // handler would then initiate shutdown.
    let ippinger_devices: IppingerDevice[] | null = null;
    let invalid_config = false;
    if (ippingerConfig !== null) {
        const parsed = ippingerConfigSchema.safeParse(ippingerConfig);
        if (parsed.success) {
            // Normalize to the internal kebab-case key (current ip-pinger
            // builds send camelCase `ipAddress`, older builds `ip-address`).
            ippinger_devices = parsed.data.devices.map(d => ({
                source: d.source,
                "ip-address": d.ipAddress ?? (d["ip-address"] as string),
            }));
        } else {
            invalid_config = true;
            const issues = parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ");
            logger()?.write_warn("pingerController.ts/getAnalyzeIpPinger", `IP pinger returned an invalid configuration: ${issues}`);
        }
    }

    if (ippinger_devices === null) {
        // IP pinger unreachable (or returned an invalid configuration) —
        // fall back to live sensors only
        const sensors = await fetch_live_sensors(network, res);
        if (sensors === null) {
            return;
        }

        logger()?.write_warn(
            "pingerController.ts/getAnalyzeIpPinger",
            invalid_config
                ? "IP pinger returned an invalid configuration — returning partial result with live sensors only"
                : "IP pinger service unavailable — returning partial result with live sensors only"
        );
        res.status(OK);
        res.contentType(Json);
        res.send({
            warning: invalid_config
                ? "ip-pinger returned an invalid configuration — analysis incomplete"
                : "ip-pinger service unavailable — analysis incomplete",
            live_sensors: sensors,
        });
        return;
    }

    // Both sources available — fetch sensors and run full analysis
    const sensors = await fetch_live_sensors(network, res);
    if (sensors === null) {
        return;
    }

    const results = analyzeIt(sensors, ippinger_devices, case_sensitive);

    res.status(OK);
    res.contentType(Json);
    res.send(results);
}

