/*
 * Copyright (c) 2025-2026 dodson Software ( dodson labs )
 * Author: Randy Dodson <dodsonsoftware@gmail.com>
 * Licensed under the MIT License with Patent Grant and NOTICE preservation.
 * See the LICENSE file for the full terms.
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

// ---- private functions

async function fetchIt(res: express.Response, originator: string, url: string) {
    const origin = `${originator}/fetchIt`;

    try {
        const response = await fetch(url);

        if (!response.ok) {
            logger()?.write_error(origin, `Url=${url}, Status=${response.status}`);
            res.status(InternalServerError).contentType(Json).send({
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

async function postIt(res: express.Response, originator: string, url: string, data: Record<string, unknown>) {
    const origin = `${originator}/postIt`;

    try {
        const response = await fetch(url, {
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

export async function getAbout(_req: express.Request, res: express.Response, ip_pinger_web_api: string) {
    const url = `${ip_pinger_web_api}/about`;
    const originator = "pingerController.ts/getAbout";
    await fetchIt(res, originator, url);
}

export async function getReadConfig(_req: express.Request, res: express.Response, ip_pinger_web_api: string) {
    const url = `${ip_pinger_web_api}/read-config`;
    const originator = "pingerController.ts/getReadConfig";
    await fetchIt(res, originator, url);
}

export async function postWriteConfig(_req: express.Request, res: express.Response, ip_pinger_web_api: string, data: Record<string, unknown>) {
    const url = `${ip_pinger_web_api}/write-config`;
    const originator = "pingerController.ts/postWriteConfig";
    await postIt(res, originator, url, data);
}

export async function postRestart(_req: express.Request, res: express.Response, ip_pinger_web_api: string, data: Record<string, unknown>) {
    const url = `${ip_pinger_web_api}/restart`;
    const originator = "pingerController.ts/postRestart";
    await postIt(res, originator, url, data);
}

export async function getPing(_req: express.Request, res: express.Response, ip_pinger_web_api: string, ping_ip_address: string) {
    const url = `${ip_pinger_web_api}/ping/${ping_ip_address}`;
    const originator = "pingerController.ts/getPing";
    await fetchIt(res, originator, url);
}

export async function getPings(_req: express.Request, res: express.Response, ip_pinger_web_api: string) {
    const url = `${ip_pinger_web_api}/ping`;
    const originator = "pingerController.ts/getPings";
    await fetchIt(res, originator, url);
}

// --------------------------------

// ---- GET ANALYZE IP PINGER

async function fetchItOnly(originator: string, url: string): Promise<unknown | null> {
    const origin = `${originator}/fetchItOnly`;

    try {
        const response = await fetch(url);
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

export async function getAnalyzeIpPinger(_req: express.Request, res: express.Response, network: MqttNetworking, ip_pinger_web_api: string, case_sensitive: boolean) {
    // start sensor "identify", "*"
    const sensors_promise = mqtt_command_get_messages(network, "*", "identify");

    // read configuration from ip-pinger
    const url = `${ip_pinger_web_api}/read-config`;
    const ippinger_config_promise = fetchItOnly("getAnalyzeIpPinger", url);

    // wait-for-them
    const request_results = await Promise.all([sensors_promise, ippinger_config_promise]);

    // get results
    const [commandControl, ippingerConfig] = request_results;
    const sensors = commandControl.results as LiveSensor[];

    if (ippingerConfig === null) {
        // IP pinger unreachable — return live sensors with a warning instead of a hard error.
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

    const ippinger_devices = (ippingerConfig as { devices: IppingerDevice[] })["devices"];

    // analyze-it
    const results = analyzeIt(sensors, ippinger_devices, case_sensitive);

    // send response
    res.status(OK);
    res.contentType(Json);
    res.send(results);
}

