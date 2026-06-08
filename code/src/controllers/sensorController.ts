/*
 * Copyright (c) 2025-2026 dodson Software ( dodson labs )
 * Author: Randy Dodson <dodsonsoftware@gmail.com>
 * Licensed under the MIT License with Patent Grant and NOTICE preservation.
 * See the LICENSE file for the full terms.
 */

import type * as express from "express";
import { InternalServerError, Json, OK } from "../dodsonlabs/HttpConstants";
import { logger } from "../common/global";
import type { MqttNetworking } from "../dodsonlabs/MqttNetworking";
import { ensureError } from "../dodsonlabs/SystemFunctions";
import type { IMqttCommandControl } from "../dodsonlabs/Interfaces";
import { randomUUID } from "crypto";



// ****************************************************************
// **** private variables

const _reboot_command_delay_seconds: number = 3;



// ****************************************************************
// **** private functions

export function create_mqtt_command_message(target: string, command: string, payload: Record<string, unknown> | null = null, commandId: string = randomUUID()): Record<string, unknown> {
    // create base message
    const msg = {
        "message-type": "command",
        "version": "2",
        "target": target.toLowerCase().trim(),
        "command": command.toLowerCase().trim(),
        "command-id": commandId,
        "payload": {}
    };

    // check for payload, add to base message
    if (payload) {
        msg["payload"] = payload;
    }

    // return completed message
    return msg;
}

function mqtt_command_start(dude: IMqttCommandControl, mqtt_request: Record<string, unknown>, network: MqttNetworking, commandId: string) {
    // initialize timer
    dude.initialize();

    // register command-id for deduplication
    network.register_command_id(commandId);

    // publish mqtt request
    network.publish_mqtt_message(network.mqtt_topic_command, mqtt_request);
}

// Maximum time to wait for a single MQTT command to complete (10 seconds).
// This is a hard safety cap — if restart_clock() keeps pushing the timeout,
// the wait must eventually exit to avoid hanging the caller forever.
const __max_wait_ms = 10_000;

async function mqtt_command_wait_for_command_completion(dude: IMqttCommandControl) {
    // Event-based wait: resolves when no more responses arrive within the timeout window,
    // or when deinitialize() is called. Eliminates the 1-second polling loop.
    const completion = dude.waitForCompletion();

    // Hard safety cap: if restart_clock() keeps resetting the timeout,
    // we must eventually exit to avoid hanging the caller forever.
    // Uses AbortController so the setTimeout is cancelled when the race resolves.
    const controller = new AbortController();
    const hard_timeout = new Promise<void>((resolve) => {
        const tid = setTimeout(() => {
            logger()?.write_error(
                "sensorController.ts/mqtt_command_wait_for_command_completion",
                `Command timed out after ${__max_wait_ms}ms hard cap`
            );
            dude.deinitialize();
            resolve();
        }, __max_wait_ms);
        controller.signal.addEventListener("abort", () => clearTimeout(tid), { once: true });
    });

    await Promise.race([completion, hard_timeout]);
    controller.abort();
    dude.deinitialize();
}

export async function mqtt_command_get_messages(network: MqttNetworking, target: string, command: string, parameters: string = ""): Promise<IMqttCommandControl> {
    // get-it
    const start_date = new Date();
    const commandId = randomUUID();
    const dude = network.get_cr_dude(command);

    // check if the request is already running
    if (dude.is_running) {
        // log-it
        logger()?.write_debug("sensorController.ts/mqtt_command_get_messages", `${command}: Request made while previous request still running...`);

        // wait-for-it
        await mqtt_command_wait_for_command_completion(dude);

    } else {
        // create mqtt request
        const mqtt_request = create_mqtt_command_message(target, `${command} ${parameters}`, null, commandId);

        // start-it
        mqtt_command_start(dude, mqtt_request, network, commandId);

        // log-it
        logger()?.write_debug("sensorController.ts/mqtt_command_get_messages", `${command}: Started...`);

        // wait-for-it
        await mqtt_command_wait_for_command_completion(dude);
    }

    // log-it
    logger()?.write_debug("sensorController.ts/mqtt_command_get_messages", `${command}...Completed`, start_date);

    // ----
    return dude;
}

async function get_it(_req: express.Request, res: express.Response, network: MqttNetworking, target: string, command: string, parameters: string = "") {
    try {
        // log-it
        const dude = await mqtt_command_get_messages(network, target, command, parameters);

        // send response
        res.status(OK);
        res.contentType(Json);
        res.send(dude.results);

    } catch (err) {
        const error = ensureError(err);

        // send error response
        res.status(InternalServerError).json({ error: error.message });
    }
}

async function post_it(_req: express.Request, res: express.Response, network: MqttNetworking, target: string, command: string, payload: Record<string, unknown> | null) {
    try {
        const commandId = randomUUID();

        // get-it
        const dude = network.get_cr_dude(command);

        // check if the request is already running
        if (dude.is_running) {
            // log-it
            logger()?.write_debug("sensorController.ts/post_it", `${command}: Request made while previous request still running...`);

            // wait-for-it
            await mqtt_command_wait_for_command_completion(dude);

        } else {
            // create mqtt request
            const mqtt_request = create_mqtt_command_message(target, command, payload, commandId);

            // start-it
            mqtt_command_start(dude, mqtt_request, network, commandId);

            // log-it
            logger()?.write_debug("sensorController.ts/post_it", `${command}: Started...`);

            // wait-for-it
            await mqtt_command_wait_for_command_completion(dude);
        }

        // send response
        res.status(OK);
        res.contentType(Json);
        res.send(dude.results);

    } catch (err) {
        const error = ensureError(err);

        // send error response
        res.status(InternalServerError).json({ error: error.message });
    }
}



// ****************************************************************
// **** public functions

// IDENTIFY

export async function getIdentify(req: express.Request, res: express.Response, network: MqttNetworking) {
    // get-it
    await get_it(req, res, network, "*", "identify");
}
export async function getIdentifyBySource(req: express.Request, res: express.Response, network: MqttNetworking, source: string) {
    // get-it
    await get_it(req, res, network, source, "identify");
}


// GET DETAILS

export async function getDetails(req: express.Request, res: express.Response, network: MqttNetworking) {
    // get-it
    await get_it(req, res, network, "*", "get-details");
}
export async function getDetailsBySource(req: express.Request, res: express.Response, network: MqttNetworking, source: string) {
    // get-it
    await get_it(req, res, network, source, "get-details");
}


// REBOOT
// NOTE: Uses get_it (not post_it) because reboot has no JSON body —
// the delay parameter is passed as an MQTT command argument, not a request body.

export async function postReboot(req: express.Request, res: express.Response, network: MqttNetworking) {
    // get-it
    await get_it(req, res, network, "*", "reboot", `${_reboot_command_delay_seconds}`);
}
export async function postRebootBySource(req: express.Request, res: express.Response, network: MqttNetworking, source: string) {
    // get-it
    await get_it(req, res, network, source, "reboot", `${_reboot_command_delay_seconds}`);
}


// READ CONFIG

export async function getReadConfig(req: express.Request, res: express.Response, network: MqttNetworking) {
    // get-it
    await get_it(req, res, network, "*", "read-config");
}
export async function getReadConfigBySource(req: express.Request, res: express.Response, network: MqttNetworking, source: string) {
    // get-it
    await get_it(req, res, network, source, "read-config");
}


// WRITE CONFIG

export async function postWriteConfigBySource(req: express.Request, res: express.Response, network: MqttNetworking, source: string) {
    // post-it with request body as config payload
    await post_it(req, res, network, source, "write-config", req.body);
}


// UPDATE CONFIG

export async function postUpdateConfigBySource(req: express.Request, res: express.Response, network: MqttNetworking, source: string) {
    // post-it with request body as config payload
    await post_it(req, res, network, source, "update-config", req.body);
}
