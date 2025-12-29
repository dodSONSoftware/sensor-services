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
// **** private functions

async function startit(dude: IMqttCommandControl, mqtt_request: any, network: MqttNetworking) {
    // intialize timer
    dude.initialize();

    // publish mqtt request
    network.publish_mqtt_message(network.mqtt_command_topic, JSON.stringify(mqtt_request));
}
async function doit(dude: IMqttCommandControl, res: express.Response, network: MqttNetworking) {
    // wait-for-it ( timer )
    while (true) {
        await sleep(1000);
        // check
        if (dude.is_timed_out) {
            break;
        }
    }

    // terminate timer
    dude.deinitialize();

    // send response
    res.status(OK);
    res.contentType(Json);
    res.send(dude.results);
}



// ****************************************************************
// **** public functions

// IDENTIFY

export async function getIdentify(req: express.Request, res: express.Response, network: MqttNetworking) {
    // check if the request is already running
    if (network.cr_identify_dude.is_running) {
        // log it
        logger.write_debug("sensorController.ts/getIdentify", "Get Identity: Request made while previous request still running...");

    } else {
        // create mqtt request
        const mqtt_request = {
            "message-type": "command",
            version: "2",
            target: "*",
            command: "identify",
        };

        await startit(network.cr_identify_dude, mqtt_request, network);

        // log it
        logger.write_debug("sensorController.ts/getIdentify", "Get Identity: Started...");
    }

    // ----
    await doit(network.cr_identify_dude, res, network);

    // log-it
    logger.write_debug("sensorController.ts/getIdentify", "Get Identity...Completed");
}

export async function getIdentifyBySource(req: express.Request, res: express.Response, network: MqttNetworking, source: string) {
    // TODO: ****************************************************************
    // TODO: ****************************************************************
    // TODO: error check the source


    // check if the request is already running
    if (network.cr_identify_dude.is_running) {
        // log it
        logger.write_debug("sensorController.ts/getIdentifyBySource", "Get Identity By Source: Request made while previous request still running...");

    } else {
        // create mqtt request
        const mqtt_request = {
            "message-type": "command",
            version: "2",
            target: source,
            command: "identify",
        };

        await startit(network.cr_identify_dude, mqtt_request, network);

        // log it
        logger.write_debug("sensorController.ts/getIdentifyBySource", "Get Identity By Source: Started...");
    }

    // ----
    await doit(network.cr_identify_dude, res, network);

    // log-it
    logger.write_debug("sensorController.ts/getIdentifyBySource", "Get Identity By Source...Completed");
}


// REBOOT

export async function postReboot(req: express.Request, res: express.Response, network: MqttNetworking) {
    // check if the request is already running
    if (network.cr_reboot_dude.is_running) {
        // log it
        logger.write_debug("sensorController.ts/postReboot", "Post Reboot: Request made while previous request still running...");

    } else {
        // create mqtt request
        const mqtt_request = {
            "message-type": "command",
            version: "2",
            target: "*",
            command: "reboot 3",
        };

        await startit(network.cr_reboot_dude, mqtt_request, network);

        // log it
        logger.write_debug("sensorController.ts/postReboot", "Post Reboot: Started...");
    }

    // ----
    await doit(network.cr_reboot_dude, res, network);

    // log-it
    logger.write_debug("sensorController.ts/postReboot", "Post Reboot...Completed");
}

export async function PostRebootBySource(req: express.Request, res: express.Response, network: MqttNetworking, source: string) {
    // TODO: ****************************************************************
    // TODO: ****************************************************************
    // TODO: error check the source


    // check if the request is already running
    if (network.cr_reboot_dude.is_running) {
        // log it
        logger.write_debug("sensorController.ts/PostRebootBySource", "Post Reboot By Source: Request made while previous request still running...");

    } else {
        // create mqtt request
        const mqtt_request = {
            "message-type": "command",
            version: "2",
            target: source,
            command: "reboot 3",
        };

        await startit(network.cr_reboot_dude, mqtt_request, network);

        // log it
        logger.write_debug("sensorController.ts/PostRebootBySource", "Post Reboot By Source: Started...");
    }

    // ----
    await doit(network.cr_reboot_dude, res, network);

    // log-it
    logger.write_debug("sensorController.ts/PostRebootBySource", "Post Reboot By Source...Completed");
}


// READ CONFIG

export async function getReadConfig(req: express.Request, res: express.Response, network: MqttNetworking) {
    // check if the request is already running
    if (network.cr_readconfig_dude.is_running) {
        // log it
        logger.write_debug("sensorController.ts/getReadConfig", "Read Config: Request made while previous request still running...");

    } else {
        // create mqtt request
        const mqtt_request = {
            "message-type": "command",
            version: "2",
            target: "*",
            command: "read-config",
        };

        await startit(network.cr_readconfig_dude, mqtt_request, network);

        // log it
        logger.write_debug("sensorController.ts/getReadConfig", "Read Config: Started...");
    }

    // ----
    await doit(network.cr_readconfig_dude, res, network);

    // log-it
    logger.write_debug("sensorController.ts/getReadConfig", "Read Config...Completed");
}

export async function getReadConfigBySource(req: express.Request, res: express.Response, network: MqttNetworking, source: string) {
    // TODO: ****************************************************************
    // TODO: ****************************************************************
    // TODO: error check the source


    // check if the request is already running
    if (network.cr_readconfig_dude.is_running) {
        // log it
        logger.write_debug("sensorController.ts/getReadConfigBySource", "Read Config By Source: Request made while previous request still running...");

    } else {
        // create mqtt request
        const mqtt_request = {
            "message-type": "command",
            version: "2",
            target: source,
            command: "read-config",
        };

        await startit(network.cr_readconfig_dude, mqtt_request, network);

        // log it
        logger.write_debug("sensorController.ts/getReadConfigBySource", "Read Config By Source: Started...");
    }

    // ----
    await doit(network.cr_readconfig_dude, res, network);

    // log-it
    logger.write_debug("sensorController.ts/getReadConfigBySource", "Read Config By Source...Completed");
}


// WRITE CONFIG

export async function postWriteConfigBySource(req: express.Request, res: express.Response, network: MqttNetworking, source: string) {
    // TODO: ****************************************************************
    // TODO: ****************************************************************
    // TODO: error check the source


    // check if the request is already running
    if (network.cr_writeconfig_dude.is_running) {
        // log it
        logger.write_debug("sensorController.ts/postWriteConfigBySource", "Write Config By Source: Request made while previous request still running...");

    } else {
        // create mqtt request
        const mqtt_request = {
            "message-type": "command",
            version: "2",
            target: source,
            command: "write-config",
            payload: req.body
        };

        await startit(network.cr_writeconfig_dude, mqtt_request, network);

        // log it
        logger.write_debug("sensorController.ts/postWriteConfigBySource", "Write Config By Source: Started...");
    }

    // ----
    await doit(network.cr_writeconfig_dude, res, network);

    // log-it
    logger.write_debug("sensorController.ts/postWriteConfigBySource", "Write Config By Source...Completed");
}


// WRITE CONFIG

export async function postUpdateConfigBySource(req: express.Request, res: express.Response, network: MqttNetworking, source: string) {
    // TODO: ****************************************************************
    // TODO: ****************************************************************
    // TODO: error check the source


    // check if the request is already running
    if (network.cr_updateconfig_dude.is_running) {
        // log it
        logger.write_debug("sensorController.ts/postUpdateConfigBySource", "Updating Config By Source: Request made while previous request still running...");

    } else {
        // create mqtt request
        const mqtt_request = {
            "message-type": "command",
            version: "2",
            target: source,
            command: "update-config",
            payload: req.body
        };

        await startit(network.cr_updateconfig_dude, mqtt_request, network);

        // log it
        logger.write_debug("sensorController.ts/postUpdateConfigBySource", "Updating Config By Source: Started...");
    }

    // ----
    await doit(network.cr_updateconfig_dude, res, network);

    // log-it
    logger.write_debug("sensorController.ts/postUpdateConfigBySource", "Updating Config By Source...Completed");
}



// GET DETAILS

export async function getDetails(req: express.Request, res: express.Response, network: MqttNetworking) {
    // TODO: ****************************************************************
    // TODO: ****************************************************************
    // TODO: error check the source


    // check if the request is already running
    if (network.cr_getdetails_dude.is_running) {
        // log it
        logger.write_debug("sensorController.ts/getDetails", "Getting Details: Request made while previous request still running...");

    } else {
        // create mqtt request
        const mqtt_request = {
            "message-type": "command",
            version: "2",
            target: "*",
            command: "get-details"
        };

        await startit(network.cr_getdetails_dude, mqtt_request, network);

        // log it
        logger.write_debug("sensorController.ts/getDetails", "Getting Details: Started...");
    }

    // ----
    await doit(network.cr_getdetails_dude, res, network);

    // log-it
    logger.write_debug("sensorController.ts/getDetails", "Getting Details...Completed");
}

export async function getDetailsBySource(req: express.Request, res: express.Response, network: MqttNetworking, source: string) {
    // TODO: ****************************************************************
    // TODO: ****************************************************************
    // TODO: error check the source


    // check if the request is already running
    if (network.cr_getdetails_dude.is_running) {
        // log it
        logger.write_debug("sensorController.ts/getIdentifyBySource", "Getting Details By Source: Request made while previous request still running...");

    } else {
        // create mqtt request
        const mqtt_request = {
            "message-type": "command",
            version: "2",
            target: source,
            command: "get-details",
        };

        await startit(network.cr_getdetails_dude, mqtt_request, network);

        // log it
        logger.write_debug("sensorController.ts/getIdentifyBySource", "Getting Details By Source: Started...");
    }

    // ----
    await doit(network.cr_getdetails_dude, res, network);

    // log-it
    logger.write_debug("sensorController.ts/getIdentifyBySource", "Getting Details By Source...Completed");
}