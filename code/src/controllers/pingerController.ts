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
        "ip-address"?: string;
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

// ---- IP validation helpers

/** Strict IPv4 address regex — four octets, each 0-255. */
const IPV4_REGEX = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/** Check if an octet is in a private/reserved range. */
function isPrivateOrReserved(ip: string): boolean {
    const match = ip.match(IPV4_REGEX);
    if (!match) return false;

    const [, a, b] = match.map(Number);

    // 10.0.0.0/8
    if (a === 10) return true;
    // 172.16.0.0/12
    if (a === 172 && b >= 16 && b <= 31) return true;
    // 192.168.0.0/16
    if (a === 192 && b === 168) return true;
    // 127.0.0.0/8 (loopback)
    if (a === 127) return true;
    // 169.254.0.0/16 (link-local)
    if (a === 169 && b === 254) return true;
    // 0.0.0.0/8
    if (a === 0) return true;
    // 224.0.0.0/4 (multicast) and 240.0.0.0/4 (reserved)
    if (a >= 224) return true;

    return false;
}

/** Validate that `ip` is a well-formed IPv4 address and not private/reserved. */
function validateIpAddress(ip: string): string | null {
    if (typeof ip !== "string" || ip.trim() === "") {
        return "target must be a non-empty string";
    }

    // Reject URL injection characters (but allow dots — they're valid in IPv4)
    if (/[?#]/.test(ip) || /\s/.test(ip) || /%/.test(ip)) {
        return "target contains invalid characters";
    }

    const match = ip.match(IPV4_REGEX);
    if (!match) {
        return "target must be a valid IPv4 address";
    }

    // Validate each octet is 0-255
    for (let i = 1; i <= 4; i++) {
        const octet = Number(match[i]);
        if (octet < 0 || octet > 255) {
            return `target octet ${i} out of range (0-255)`;
        }
    }

    if (isPrivateOrReserved(ip)) {
        return "target IP is in a private or reserved range";
    }

    return null; // valid
}

// ---- private functions

async function fetchIt(res: express.Response, originator: string, url: string, timeoutMs: number) {
    const origin = `${originator}/fetchIt`;

    try {
        const response = await fetchWithTimeout(url, timeoutMs);

        if (!response.ok) {
            logger()?.write_error(origin, `Url=${url}, Status=${response.status}`);
            res.status(502).contentType(Json).send({
                error: `upstream error: ${response.status} ${response.statusText}`
            });
            return;
        }

        const data = await response.json();
        logger()?.write_debug(origin, `Url=${url}, Data=${JSON.stringify(data)}`);
        res.status(OK).contentType(Json).send(data);

    } catch (error) {
        logger()?.write_error(origin, `Url: ${url}, Error=${error}`);
        res.status(502).contentType(Json).send({ error: "upstream unavailable" });
    }
}

async function postIt(res: express.Response, originator: string, url: string, data: Record<string, unknown>, timeoutMs: number) {
    const origin = `${originator}/postIt`;

    try {
        const response = await fetchWithTimeout(url, timeoutMs, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! Status=${response.status}::${response.statusText}`);
        }

        const result = await response.json();
        logger()?.write_debug(origin, `Data=${JSON.stringify(result)}`);
        res.status(OK).contentType(Json).send(result);

    } catch (error) {
        logger()?.write_error(origin, `Url: ${url}, Error=${error}`);
        res.status(502).contentType(Json).send({ error: "upstream unavailable" });
    }
}



// ---- public functions

export async function getAbout(_req: express.Request, res: express.Response, ip_pinger_web_api: string, timeoutMs: number) {
    const url = `${ip_pinger_web_api}/about`;
    const originator = "pingerController.ts/getAbout";
    await fetchIt(res, originator, url, timeoutMs);
}

export async function getReadConfig(_req: express.Request, res: express.Response, ip_pinger_web_api: string, timeoutMs: number) {
    const url = `${ip_pinger_web_api}/read-config`;
    const originator = "pingerController.ts/getReadConfig";
    await fetchIt(res, originator, url, timeoutMs);
}

export async function postWriteConfig(_req: express.Request, res: express.Response, ip_pinger_web_api: string, data: Record<string, unknown>, timeoutMs: number) {
    const url = `${ip_pinger_web_api}/write-config`;
    const originator = "pingerController.ts/postWriteConfig";
    await postIt(res, originator, url, data, timeoutMs);
}

export async function postRestart(_req: express.Request, res: express.Response, ip_pinger_web_api: string, data: Record<string, unknown>, timeoutMs: number) {
    const url = `${ip_pinger_web_api}/restart`;
    const originator = "pingerController.ts/postRestart";
    await postIt(res, originator, url, data, timeoutMs);
}

export async function getPing(_req: express.Request, res: express.Response, ip_pinger_web_api: string, target: string, timeoutMs: number) {
    const originator = "pingerController.ts/getPing";

    const error = validateIpAddress(target);
    if (error) {
        logger()?.write_warn(originator, `Invalid target: ${target}, Reason: ${error}`);
        res.status(400).contentType(Json).send({ error });
        return;
    }

    const url = `${ip_pinger_web_api}/ping/${target}`;
    await fetchIt(res, originator, url, timeoutMs);
}

export async function getPings(_req: express.Request, res: express.Response, ip_pinger_web_api: string, timeoutMs: number) {
    const url = `${ip_pinger_web_api}/ping`;
    const originator = "pingerController.ts/getPings";
    await fetchIt(res, originator, url, timeoutMs);
}

// --------------------------------

// ---- GET ANALYZE IP PINGER

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
            const sensor_ipaddress = String(sensor?.payload?.["ip-address"] ?? "");

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
            const sensor_ip: LiveSensor | undefined = live_sensors.find(x => { return x?.payload?.["ip-address"] === ip_address; });
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
        const ip_address = sensor?.payload?.["ip-address"];

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
        // Start the MQTT identify in parallel so we don't block on the slow path.
        const commandControl = await mqtt_command_get_messages(network, "*", "identify");
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
    const commandControl = await mqtt_command_get_messages(network, "*", "identify");
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

