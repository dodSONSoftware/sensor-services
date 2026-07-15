/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import type * as express from "express";
import { InternalServerError, Json, OK } from "../dodsonlabs/HttpConstants";
import { logger } from "../common/global";
import type { MqttNetworking } from "../dodsonlabs/MqttNetworking";
import { ensureError } from "../dodsonlabs/SystemFunctions";
import type { IMqttCommandControl, ILogger } from "../dodsonlabs/Interfaces";
import { randomUUID } from "crypto";

// Null-safe logger: falls back to no-op methods when logger() is undefined
// (e.g., during tests where createLogger() is not called).
// In production, createLogger() is always called before any controller use.
const _noopLogger: ILogger = {
    global_log_level: () => 0,
    global_log_level_string: () => "none",
    write_info: () => {},
    write_warn: () => {},
    write_error: () => {},
    write_debug: () => {},
};
const _log = () => logger() ?? _noopLogger;



// ****************************************************************
// **** private variables

const _reboot_command_delay_seconds: number = 3;



// ****************************************************************
// **** private functions

export function create_mqtt_command_message(target: string, command: string, payload: Record<string, unknown> | null = null, commandId: string = randomUUID()): Record<string, unknown> {
    // create base message
    return {
        "message-type": "command",
        "version": "2",
        "target": target.toLowerCase().trim(),
        "command": command.toLowerCase().trim(),
        "command-id": commandId,
        "payload": payload ?? {}
    };
}

function mqtt_command_start(dude: IMqttCommandControl, mqtt_request: Record<string, unknown>, network: MqttNetworking) {
    // initialize timer
    dude.initialize();

    // publish mqtt request (dedup handled inline by publish_mqtt_message)
    network.publish_mqtt_message(network.mqtt_topic_command, mqtt_request);
}

// Maximum time to wait for a single MQTT command to complete (10 seconds).
// This is a hard safety cap — if restart_clock() keeps pushing the timeout,
// the wait must eventually exit to avoid hanging the caller forever.
const __max_wait_ms = 10_000;

/**
 * Enriches command results with metadata about the command execution.
 * Adds command_id, command_sent_at, and expected_delay_seconds to each result.
 */
export function enrichResultsWithMetadata(
    results: IMqttCommandControl["results"],
    commandId: string,
    expectedDelaySeconds?: number
): Record<string, unknown>[] {
    const now = new Date().toISOString();
    return results.map((result) => ({
        ...result,
        command_metadata: {
            command_id: commandId,
            command_sent_at: now,
            expected_delay_seconds: expectedDelaySeconds ?? _reboot_command_delay_seconds,
        },
    }));
}

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
            _log().write_error(
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

export async function mqtt_command_get_messages(network: MqttNetworking, target: string, command: string, parameters: string = "", commandId?: string): Promise<IMqttCommandControl | null> {
    // get-it
    const start_date = new Date();
    const cmdId = commandId ?? randomUUID();
    const dude = network.get_cr_dude(command);
    if (dude === null) {
        _log().write_error("sensorController.ts/mqtt_command_get_messages", `Unknown command type '${command}', rejecting`);
        throw new Error(`Unknown command type: ${command}`);
    }

    // check if the request is already running
    if (dude.is_running) {
        // log-it
        _log().write_debug("sensorController.ts/mqtt_command_get_messages", `${command}: Request made while previous request still running...`);

        // wait-for-it
        await mqtt_command_wait_for_command_completion(dude);

    } else {
        // create mqtt request
        const mqtt_request = create_mqtt_command_message(target, `${command} ${parameters}`, null, cmdId);

        // start-it
        mqtt_command_start(dude, mqtt_request, network);

        // log-it
        _log().write_debug("sensorController.ts/mqtt_command_get_messages", `${command}: Started...`);

        // wait-for-it
        await mqtt_command_wait_for_command_completion(dude);
    }

    // log-it
    _log().write_debug("sensorController.ts/mqtt_command_get_messages", `${command}...Completed`, start_date);

    // ----
    return dude;
}

async function get_it(_req: express.Request, res: express.Response, network: MqttNetworking, target: string, command: string, parameters: string = "", commandId?: string) {
    try {
        // log-it
        const dude = await mqtt_command_get_messages(network, target, command, parameters, commandId);
        if (dude === null) {
            return; // error already sent by mqtt_command_get_messages
        }

        // send response
        res.status(OK);
        res.contentType(Json);

        // Enrich results with metadata if commandId is provided
        if (commandId && command === "reboot") {
            res.send(enrichResultsWithMetadata(dude.results, commandId));
        } else {
            res.send(dude.results);
        }
        dude.clear_results();

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
        if (dude === null) {
            _log().write_error("sensorController.ts/post_it", `Unknown command type '${command}', rejecting`);
            res.status(InternalServerError).json({ error: `Unknown command type: ${command}` });
            return;
        }

        // check if the request is already running
        if (dude.is_running) {
            // log-it
            _log().write_debug("sensorController.ts/post_it", `${command}: Request made while previous request still running...`);

            // wait-for-it
            await mqtt_command_wait_for_command_completion(dude);

        } else {
            // create mqtt request
            const mqtt_request = create_mqtt_command_message(target, command, payload, commandId);

            // start-it
            mqtt_command_start(dude, mqtt_request, network);

            // log-it
            logger()?.write_debug("sensorController.ts/post_it", `${command}: Started...`);

            // wait-for-it
            await mqtt_command_wait_for_command_completion(dude);
        }

        // send response
        res.status(OK);
        res.contentType(Json);
        res.send(dude.results);
        dude.clear_results();

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
    // Generate commandId upfront so we can include it in enriched results
    const commandId = randomUUID();
    // get-it with commandId for enrichment
    await get_it(req, res, network, "*", "reboot", `${_reboot_command_delay_seconds}`, commandId);
}
export async function postRebootBySource(req: express.Request, res: express.Response, network: MqttNetworking, source: string) {
    // Generate commandId upfront so we can include it in enriched results
    const commandId = randomUUID();
    // get-it with commandId for enrichment
    await get_it(req, res, network, source, "reboot", `${_reboot_command_delay_seconds}`, commandId);
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
