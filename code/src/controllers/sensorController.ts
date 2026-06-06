/*
 * Copyright (c) 2025-2026 dodson Software ( dodson labs )
 * Author: Randy Dodson <dodsonsoftware@gmail.com>
 * Licensed under the MIT License with Patent Grant and NOTICE preservation.
 * See the LICENSE file for the full terms.
 */

import * as express from "express";
import { InternalServerError, Json, OK } from "../dodsonlabs/HttpConstants";
import { logger } from "../common/global";
import { MqttNetworking } from "../dodsonlabs/MqttNetworking";
import { ensureError, sleep } from "../dodsonlabs/SystemFunctions";
import { IMqttCommandControl } from "../dodsonlabs/Interfaces";



// ****************************************************************
// **** private variables

const _reboot_command_delay_seconds: number = 3;



// ****************************************************************
// **** private functions

function create_mqtt_command_message(target: string, command: string, payload: Record<string, any> | null = null): Record<string, any> {
    // create base message
    const msg = {
        "message-type": "command",
        "version": "2",
        "target": target.toLowerCase().trim(),
        "command": command.toLowerCase().trim(),
        "payload": {}
    };

    // check for playload, add to base message
    if (payload) {
        msg["payload"] = payload;
    }

    // return completed message
    return msg;
}

function mqtt_command_start(dude: IMqttCommandControl, mqtt_request: Record<string, any>, network: MqttNetworking) {
    // intialize timer
    dude.initialize();

    // publish mqtt request
    network.publish_mqtt_message(network.mqtt_topic_command, mqtt_request);
}

async function mqtt_command_wait_for_command_completion(dude: IMqttCommandControl) {
    while (true) {
        // wait-a-bit
        await sleep(1000);
        // check dude
        if (dude.is_timed_out) {
            break;
        }
    }

    // terminate timer
    dude.deinitialize();
}

export async function mqtt_command_get_messages(network: MqttNetworking, target: string, command: string, parameters: string = ""): Promise<IMqttCommandControl> {
    // get-it
    const start_date = new Date();
    const dude = network.get_cr_dude(command);

    // check if the request is already running
    if (dude.is_running) {
        // log-it
        logger.write_debug("sensorController.ts/mqtt_command_get_messages", `${command}: Request made while previous request still running...`);

        // wait-for-it
        await mqtt_command_wait_for_command_completion(dude);

    } else {
        // create mqtt request
        const mqtt_request = create_mqtt_command_message(target, `${command} ${parameters}`);

        // start-it
        mqtt_command_start(dude, mqtt_request, network);

        // log-it
        logger.write_debug("sensorController.ts/mqtt_command_get_messages", `${command}: Started...`);

        // wait-for-it
        await mqtt_command_wait_for_command_completion(dude);
    }

    // log-it
    logger.write_debug("sensorController.ts/mqtt_command_get_messages", `${command}...Completed`, start_date);

    // ----
    return dude;
}

async function get_it(req: express.Request, res: express.Response, network: MqttNetworking, target: string, command: string, parameters: string = "") {
    try {
        // log-it
        const dude = await mqtt_command_get_messages(network, target, command);

        // send response
        res.status(OK);
        res.contentType(Json);
        res.send(dude.results);

    } catch (err) {
        const error = ensureError(err);

        // send error response
        res.status(InternalServerError);
        res.send(error);
    }
}

async function post_it(req: express.Request, res: express.Response, network: MqttNetworking, target: string, command: string, payload: Record<string, any> | null) {
    try {
        // get-it
        const dude = network.get_cr_dude(command);

        // check if the request is already running
        if (dude.is_running) {
            // log-it
            logger.write_debug("sensorController.ts/post_it", `${command}: Request made while previous request still running...`);

            // wait-for-it
            await mqtt_command_wait_for_command_completion(dude);

        } else {
            // create mqtt request
            const mqtt_request = create_mqtt_command_message(target, command, payload);

            // start-it
            mqtt_command_start(dude, mqtt_request, network);

            // log-it
            logger.write_debug("sensorController.ts/post_it", `${command}: Started...`);

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
        res.status(InternalServerError);
        res.send(error);
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

export async function postReboot(req: express.Request, res: express.Response, network: MqttNetworking) {
    // get-it
    await get_it(req, res, network, "*", "reboot", `${_reboot_command_delay_seconds}`);
}
export async function PostRebootBySource(req: express.Request, res: express.Response, network: MqttNetworking, source: string) {
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
