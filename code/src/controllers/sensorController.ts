/*
 * Copyright (c) 2025 dodson Software ( dodson labs )
 * Author: Randy Dodson <dodsonsoftware@gmail.com>
 * Licensed under the MIT License with Patent Grant and NOTICE preservation.
 * See the LICENSE file for the full terms.
 */

import * as express from "express";
import { Json, OK, Text } from "../dodsonlabs/HttpConstants";
import { logger } from "../common/global";
import { MqttNetworking } from "../dodsonlabs/MqttNetworking";
import { sleep } from "../dodsonlabs/SystemFunctions";
import { IMqttCommandControl } from "../dodsonlabs/Interfaces";



// ****************************************************************
// **** private variables

const _reboot_command_delay_seconds: number = 3;



// ****************************************************************
// **** private functions

function create_mqtt_command_message(target: string, command: string, payload: Record<string, any> | null = null): any {
    // create base message
    const msg = {
        "message-type": "command",
        "version": "2",
        "target": target.trim(),
        "command": command.trim(),
        "payload": {}
    };

    // check for playload, add to base message
    if (payload) {
        msg["payload"] = payload;
    }

    // return completed message
    return msg;
}

function start_it(dude: IMqttCommandControl, mqtt_request: any, network: MqttNetworking) {
    // intialize timer
    dude.initialize();

    // publish mqtt request
    network.publish_mqtt_message(network.mqtt_command_topic, JSON.stringify(mqtt_request));
}

async function wait_for_it(dude: IMqttCommandControl) {
    while (true) {
        await sleep(1000);
        // check
        if (dude.is_timed_out) {
            break;
        }
    }
}

async function do_it(dude: IMqttCommandControl, res: express.Response, network: MqttNetworking) {
    // wait-for-it
    await wait_for_it(dude);

    // terminate timer
    dude.deinitialize();

    // send response
    res.status(OK);
    res.contentType(Json);
    res.send(dude.results);
}

async function get_it(req: express.Request, res: express.Response, network: MqttNetworking, target: string, command: string, parameters: string = "") {
    // get-it
    const dude = network.get_cr_dude(command);

    // check if the request is already running
    if (dude.is_running) {
        // log-it
        logger.write_debug("sensorController.ts/get_it", `${command}: Request made while previous request still running...`);

        // wait-for-it
        await wait_for_it(dude);

        // grab-it
        dude.is_running = true;
    }

    // create mqtt request
    const mqtt_request = create_mqtt_command_message(target, `${command} ${parameters}`);

    // start-it
    start_it(dude, mqtt_request, network);

    // log-it
    logger.write_debug("sensorController.ts/get_it", `${command}: Started...`);

    // do-it
    await do_it(dude, res, network);

    // log-it
    logger.write_debug("sensorController.ts/get_it", `${command}...Completed`);
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
    // get-it
    await get_it(req, res, network, source, "write-config");
}


// UPDATE CONFIG

export async function postUpdateConfigBySource(req: express.Request, res: express.Response, network: MqttNetworking, source: string) {
    // get-it
    await get_it(req, res, network, source, "update-config");
}
