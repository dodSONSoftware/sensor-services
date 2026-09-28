/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import type * as express from "express";
import { logger } from "../common/global";
import { Json, OK, InternalServerError } from "../dodsonlabs/HttpConstants";
import type { MqttNetworking } from "../dodsonlabs/MqttNetworking";
import { mqtt_command_get_messages } from "./sensorController";

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

export async function getAnalyzeIpPinger(_req: express.Request, res: express.Response, network: MqttNetworking, ip_pinger_web_api: string, case_sensitive: boolean, timeoutMs: number) {
    // read configuration from ip-pinger first — fast path, fails quickly on error
    const url = `${ip_pinger_web_api}/read-config`;
    const ippingerConfig = await fetchItOnly("getAnalyzeIpPinger", url, timeoutMs);

    if (ippingerConfig === null) {
        // IP pinger unreachable — fall back to live sensors only.
        // Start the MQTT get-details in parallel so we don't block on the slow path.
        const commandControl = await mqtt_command_get_messages(network, "*", "get-details");
        if (commandControl === null) {
            res.status(InternalServerError).json({ error: "Unknown command type received from sensor" });
            return;
        }
        const sensors = commandControl.results as LiveSensor[];
        commandControl.clear_results();

        logger()?.write_warn(
            "pingerController.ts/getAnalyzeIpPinger",
            "IP pinger service unavailable — returning partial result with live sensors only"
        );
        res.status(OK);
        res.contentType(Json);
        res.send({
            warning: "ip-pinger service unavailable — analysis incomplete",
            live_sensors: sensors,
        });
        return;
    }

    // Both sources available — fetch sensors and run full analysis
    const commandControl = await mqtt_command_get_messages(network, "*", "get-details");
    if (commandControl === null) {
        res.status(InternalServerError).json({ error: "Unknown command type received from sensor" });
        return;
    }
    const sensors = commandControl.results as LiveSensor[];

    try {
        const ippinger_devices = (ippingerConfig as { devices: IppingerDevice[] })["devices"];
        const results = analyzeIt(sensors, ippinger_devices, case_sensitive);

        res.status(OK);
        res.contentType(Json);
        res.send(results);
    } finally {
        commandControl.clear_results();
    }
}

