/*
 * Author: Randy Dodson ( dodson labs )
 * License: 2025, MIT License (see LICENSE file for details)
 */

import * as express from "express";
import { Json, OK, Text } from "../dodsonlabs/HttpConstants";
import { logger } from "../common/global";
import { Networking } from "../dodsonlabs/Networking";
import { sleep } from "../dodsonlabs/SystemFunctions";

// **** public functions

export async function getIdentify(
    req: express.Request,
    res: express.Response,
    network: Networking
) {
    // log it
    logger.write_info("sensorController.ts/getIdentify", "Get Identity");

    // intialize
    network.initialize_mqtt_command_response_identify();

    // create mqtt request
    const mqtt_request = {
        "message-type": "command",
        version: "2",
        target: "*",
        command: "identify",
    };

    // publish mqtt request
    network.publish_mqtt_message(
        network.mqtt_command_topic,
        JSON.stringify(mqtt_request)
    );

    // wait-for-it
    while (true) {
        await sleep(1000);
        if (network.command_response_identify_timed_out) {
            break;
        }
    }

    // log-it
    console.log(`\n\n<<<<<<<< [ export function getIdentify ] >>>>>>>> \n`);
    network.command_response_identify_response.forEach((element) => {
        console.log(`\t${JSON.stringify(element, null, 4)}`);
    });
    console.log(`\n\n`);

    // send response
    res.status(OK);
    res.contentType(Json);
    res.send(network.command_response_identify_response);
}

export async function getIdentifyBySource(
    req: express.Request,
    res: express.Response,
    network: Networking,
    source: string
) {
    // TODO: ****************************************************************
    // TODO: ****************************************************************
    // TODO: error check the source

    // log it
    logger.write_info(
        "sensorController.ts/getIdentify",
        `Get Identity for ${source}`
    );

    // intialize
    network.initialize_mqtt_command_response_identify();

    // TODO: ****************************************************************
    // TODO: ****************************************************************
    // TODO: make this case insensitive
    // TODO: this will require making the sensor code case insensitive, too

    // create mqtt request
    const mqtt_request = {
        "message-type": "command",
        version: "2",
        target: source,
        command: "identify",
    };

    // publish mqtt request
    network.publish_mqtt_message(
        network.mqtt_command_topic,
        JSON.stringify(mqtt_request)
    );

    // wait-for-it
    while (true) {
        await sleep(1000);
        if (network.command_response_identify_timed_out) {
            break;
        }
    }

    // fix-it
    let dude = {};
    if (network.command_response_identify_response.length > 0) {
        dude = network.command_response_identify_response[0];
    }

    // log-it
    console.log(
        `\n\n<<<<<<<< [ export function getIdentify/source ] >>>>>>>> \n`
    );
    console.log(`\t${JSON.stringify(dude, null, 4)}`);
    console.log(`\n\n`);

    // send response
    res.status(OK);
    res.contentType(Json);
    res.send(dude);
}
