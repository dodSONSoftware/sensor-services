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



// ---- private functions

function fetchIt(res: express.Response, originator: string, url: string) {
    const origin = `${originator}/fetchIt`;

    fetch(url)
        .then(response => {
            // ---- check the response
            if (!response.ok) {
                // log it
                logger?.write_error(origin, `Url=${url}, Response=${response}`);

                // publish it
                res.status(InternalServerError);
                res.contentType(Json);
                res.send(response);
                // !!!!
                // !!!! Research this: should I throw an Error
                // !!!!
                return null;
            }
            // next--> data as json
            return response.json();
        })
        .then(data => {
            // ---- process data as json
            // log it
            logger?.write_debug(origin, `Url=${url}, Data=${JSON.stringify(data)}`);

            // publish it
            res.status(OK);
            res.contentType(Json);
            res.send(data);
        })
        .catch(error => {
            logger?.write_error(origin, `Url: ${url}, Error=${error}`);
        });
}

function postIt(res: express.Response, originator: string, url: string, data: unknown) {
    const origin = `${originator}/postIt`;

    fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(data)

    }).then((response) => {
        // Check if the response is okay
        if (!response.ok) {
            // log it/throw error
            throw new Error(`HTTP error! Response=${response.status}::${response.statusText}`);
        }
        return response.json();

    }).then((result) => {
        // ---- process data as json
        // log it
        logger?.write_debug(origin, `Data=${JSON.stringify(result)}`);

        // publish it
        res.status(OK);
        res.contentType(Json);
        res.send(result);

    }).catch((error) => {
        logger?.write_error(origin, `Url: ${url}, Error=${error}`);
    });
}



// ---- public functions

export function getAbout(req: express.Request, res: express.Response, ip_pinger_web_api: string) {
    // get {ip-pinger} web service api
    const url = `${ip_pinger_web_api}/about`;
    const originator = "pingerController.ts/getAbout";

    fetchIt(res, originator, url);
}

export function getReadConfig(req: express.Request, res: express.Response, ip_pinger_web_api: string) {
    // get {ip-pinger} web service api
    const url = `${ip_pinger_web_api}/read-config`;
    const originator = "pingerController.ts/getReadConfig";

    fetchIt(res, originator, url);
}

export function postWriteConfig(req: express.Request, res: express.Response, ip_pinger_web_api: string, data: unknown): void {
    // get {ip-pinger} web service api
    const url = `${ip_pinger_web_api}/write-config`;
    const originator = "pingerController.ts/postWriteConfig";

    postIt(res, originator, url, data);
}

export function postRestart(req: express.Request, res: express.Response, ip_pinger_web_api: string): void {
    // get {ip-pinger} web service api
    const url = `${ip_pinger_web_api}/restart`;
    const originator = "pingerController.ts/postRestart";

    postIt(res, originator, url, req.body);
}

export function getPing(req: express.Request, res: express.Response, ip_pinger_web_api: string, ping_ip_address: string): void {
    // get {ip-pinger} web service api
    const url = `${ip_pinger_web_api}/ping/${ping_ip_address}`;
    const originator = "pingerController.ts/getPing";

    fetchIt(res, originator, url);
}

export function getPings(req: express.Request, res: express.Response, ip_pinger_web_api: string): void {
    // get {ip-pinger} web service api
    const url = `${ip_pinger_web_api}/ping`;
    const originator = "pingerController.ts/getPing";

    fetchIt(res, originator, url);
}

// --------------------------------

// ---- GET ANALYZE IP PINGER
// NOTE: This section uses `any` because it processes dynamic JSON from MQTT sensor telemetry
// and external HTTP APIs where the shape is not known at compile time.

/* eslint-disable @typescript-eslint/no-explicit-any */

async function fetchItOnly(originator: string, url: string): Promise<unknown> {
    const origin = `${originator}/fetchItOnly`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            logger?.write_error(origin, `Url=${url}, Status=${response.status}`);
            return {}; // or return null / throw depending on caller expectations
        }

        const data = await response.json();
        logger?.write_debug(origin, `Url=${url}, Data=${JSON.stringify(data)}`);
        return data;

    } catch (error) {
        logger?.write_error(origin, `Url=${url}, Error=${error}`);
        return {}; // keep consistent return type on failure
    }
}

export function createAnalyzeResult(state: string, state_value: Record<string, any>, origin: Record<string, any>): Record<string, any> {
    origin["state"] = state;
    origin["state-value"] = state_value;
    return origin;
}

export function analyzeIt(live_sensors: Record<string, any>[], ippinger_devices: Record<string, any>[], case_sensitive: boolean): Record<string, any>[] {
    // For each config device: find matching live sensor by source (then IP).
    // Then scan for live sensors with no matching config entry (New).
    // States: OK, IP Address Mismatch, Name Mismatch, Offline, New

    // init
    const results: Record<string, any>[] = [];

    // process each device defined in the IP Pinger configuration
    ippinger_devices.forEach(device => {
        const source = String(device["source"]);
        const ip_address = String(device["ip-address"]);

        // find source in live_sensors
        let sensor: Record<string, any> | undefined;
        if (case_sensitive) {
            sensor = live_sensors.find(x => { return x["source"] === source; });
        } else {
            sensor = live_sensors.find(x => { return x["source"].toLowerCase() === source.toLowerCase(); });
        }

        // check
        if (sensor) {
            // init
            const sensor_ipaddress = String(sensor["payload"]["ip-address"]);

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
            const sensor_ip: Record<string, any> | undefined = live_sensors.find(x => { return x["payload"]["ip-address"] === ip_address; });
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
        const ip_address = sensor["payload"]["ip-address"];

        // check if live_sensor.source is in ippinger-devices
        let dude: Record<string, any> | undefined;
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

export async function getAnalyzeIpPinger(req: express.Request, res: express.Response, network: MqttNetworking, ip_pinger_web_api: string, case_sensitive: boolean) {
    // start sensor "identify", "*"
    const sensors_promise = mqtt_command_get_messages(network, "*", "identify");

    // read configuration from ip-pinger
    const url = `${ip_pinger_web_api}/read-config`;
    const ippinger_config_promise = fetchItOnly("getAnalyzeIpPinger", url);

    // wait-for-them
    const request_results = await Promise.all([sensors_promise, ippinger_config_promise]);

    // get results
    const [commandControl, ippingerConfig] = request_results;
    const sensors = commandControl.results as Record<string, any>[];
    const ippinger_devices = (ippingerConfig as Record<string, any>)["devices"] as Record<string, any>[];

    // analyze-it
    const results = analyzeIt(sensors, ippinger_devices, case_sensitive);

    // send response
    res.status(OK);
    res.contentType(Json);
    res.send(results);
}
/* eslint-enable @typescript-eslint/no-explicit-any */

