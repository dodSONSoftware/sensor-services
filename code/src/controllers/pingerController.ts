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
 * Throws an AbortError when the timeout fires; callers catch it and
 * degrade to a warning rather than failing the request.
 */
async function fetchWithTimeout(
    url: string,
    timeoutMs: number,
    init?: RequestInit
): Promise<Response> {
    const signal = AbortSignal.timeout(timeoutMs);
    return fetch(url, { ...init, signal });
}

/**
 * Outcome of a bounded pinger fetch: a parsed 2xx body, the non-OK HTTP
 * status, or a network/timeout/parse failure. The caller maps these to
 * distinct user-visible warnings, so an authentication failure (401 — the
 * pinger's config API rejected or never received the x-config-token header)
 * and a disabled config API (503) are distinguishable from plain
 * unavailability.
 */
type PingerFetchOutcome =
    | { kind: "ok"; data: unknown }
    | { kind: "http"; status: number }
    | { kind: "error" };

async function fetchItOnly(originator: string, url: string, timeoutMs: number, init?: RequestInit): Promise<PingerFetchOutcome> {
    const origin = `${originator}/fetchItOnly`;

    try {
        const response = await fetchWithTimeout(url, timeoutMs, init);
        if (!response.ok) {
            logger()?.write_warn(origin, `Url=${url}, Status=${response.status}`);
            return { kind: "http", status: response.status };
        }

        const data = await response.json();
        logger()?.write_debug(origin, `Url=${url}, Data=${JSON.stringify(data)}`);
        return { kind: "ok", data };

    } catch (error) {
        logger()?.write_error(origin, `Url=${url}, Error=${error}`);
        return { kind: "error" };
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

export async function getAnalyzeIpPinger(_req: express.Request, res: express.Response, network: MqttNetworking, ip_pinger_web_api: string, case_sensitive: boolean, timeoutMs: number, configToken?: string) {
    // read configuration from ip-pinger first — fast path, fails quickly on error
    const url = `${ip_pinger_web_api}/read-config`;
    // When ip-pinger-config-token is configured, the pinger's config API
    // requires the shared secret in the x-config-token header. Unset key ->
    // header omitted; if the pinger's API is enabled without a valid token
    // that degrades to the 401 warning below instead of a bare 503.
    const init: RequestInit | undefined = configToken
        ? { headers: { "x-config-token": configToken } }
        : undefined;
    const outcome = await fetchItOnly("getAnalyzeIpPinger", url, timeoutMs, init);

    // Map non-ok outcomes to the operator-facing warning so the response
    // names the actual problem: 401 = the pinger's config API is enabled and
    // rejected (or never received) the token; 503 = the config API is
    // disabled in the pinger's deployment; anything else (other status,
    // network, timeout) is plain unavailability.
    let fetch_failure_reason = "IP pinger service unavailable";
    let unavailable_warning = "ip-pinger service unavailable — analysis incomplete";
    if (outcome.kind === "http" && outcome.status === 401) {
        fetch_failure_reason = "IP pinger config API rejected the token";
        unavailable_warning = "ip-pinger config API rejected the token — analysis incomplete";
    } else if (outcome.kind === "http" && outcome.status === 503) {
        fetch_failure_reason = "IP pinger config API disabled";
        unavailable_warning = "ip-pinger config API disabled — analysis incomplete";
    }

    // Validate the upstream response at the boundary instead of casting it.
    // An unchecked `as { devices: IppingerDevice[] }` let `undefined`/`null`
    // reach analyzeIt() (TypeError in the async handler), and Express 4 does
    // not catch handler rejections — the process-level unhandledRejection
    // handler would then initiate shutdown.
    let ippinger_devices: IppingerDevice[] | null = null;
    let invalid_config = false;
    if (outcome.kind === "ok") {
        const parsed = ippingerConfigSchema.safeParse(outcome.data);
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
                : `${fetch_failure_reason} — returning partial result with live sensors only`
        );
        res.status(OK);
        res.contentType(Json);
        res.send({
            warning: invalid_config
                ? "ip-pinger returned an invalid configuration — analysis incomplete"
                : unavailable_warning,
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

