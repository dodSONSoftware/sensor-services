/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import mqtt from "mqtt";
import * as sysFunc from "./SystemFunctions";
import { LogLevel } from "./Interfaces";
import type { ILogger, IMqttCommandControl, IMqttNetworking, MqttCommandResult } from "./Interfaces";
import { MqttCommandControl } from "./MqttCommandControl";
import type { configSchema } from "../schemas/config";
import type { z } from "zod";

/**
 * V3 MQTT message envelope — the JSON document published on the broker.
 *
 * The broker is unauthenticated, so every field is a claim from the sender,
 * not a fact: each handler re-validates the fields it relies on at runtime
 * before use. All fields are optional because dispatch is on message_type
 * alone (never topic-correlated) and a legacy or malformed document may
 * omit the rest — the legacy flat log shape carries level/message at top
 * level and has no payload or message_schema_version. `payload` stays
 * unknown until a handler's runtime checks establish the variant's shape.
 *
 * Declared as a type (not an interface) so it is assignable to
 * Record<string, unknown> — the parameter type of getField()/
 * getNumericField() — via the implicit index signature type literals get.
 */
type MqttV3Envelope = {
    message_type?: string | number;
    message_schema_version?: number;
    source?: string;
    request_id?: string;
    request_type?: string;
    firmware_version?: string;
    runtime_id?: string;
    uptime_ms?: number;
    timestamp?: string;
    sequence?: number;
    level?: string;
    message?: unknown;
    payload?: unknown;
};



export class MqttNetworking implements IMqttNetworking {

    // ********
    // ******** CONSTANTS

    // Heat index calculation threshold (Celsius)
    // Below this temperature, feels-like equals actual temperature
    private static readonly HEAT_INDEX_THRESHOLD_C: number = 20;

    // V3 MQTT topics
    private static readonly MQTT_TOPIC_INFO_REQUEST_V3 = "iot/v3/info-request";
    private static readonly MQTT_TOPIC_INFO_RESPONSE_V3 = "iot/v3/info-response";
    private static readonly MQTT_TOPIC_LOG_V3 = "iot/v3/log";

    // ********
    // ******** CTOR

    constructor(config: z.infer<typeof configSchema>, logger: ILogger) {

        // save parameters
        this.mqtt_server_ip_address = config["mqtt-broker-ip-address"];
        this.mqtt_topic_command = config["mqtt-topic-command"];
        this.mqtt_topic_command_response = config["mqtt-topic-command-response"];
        this.mqtt_topic_log = config["mqtt-topic-log"] ?? MqttNetworking.MQTT_TOPIC_LOG_V3;
        // ----
        this.logger = logger;
        this.originator = "networking";
        // ---- sensor log forwarding (default true for backward compatibility)
        this.forward_sensor_logs = config["forward-sensor-logs"] ?? true;
        // ---- sensor log level threshold (default debug = forward everything)
        this.forward_sensor_logs_level = config["forward-sensor-logs-level"]
            ? sysFunc.convert_from_log_level_string_to_enum(config["forward-sensor-logs-level"])
            : LogLevel.Debug;

        // ---- command silence timeout (default 1500ms for backward compatibility)
        this.__command_silence_timeout_ms = config["command-silence-timeout-ms"] ?? 1500;

        // create mqtt client and connect to mqtt server
        this.mqtt_client = this.connect_to_mqtt_broker();

        // log-it
        this.logger.write_info("MqttNetworking::ctor()", "MqttNetworking Initialized");
    }

    // ********
    // ******** PUBLIC METHODS

    /**
     * Calculate heat index (feels like temperature) from temperature and humidity.
     * Uses the NOAA/NWS Rothfusz regression (valid at T >= 80°F / 26.67°C),
     * including the standard low-humidity and high-humidity corrections.
     * Below 80°F the accepted preliminary approximation is used; below
     * HEAT_INDEX_THRESHOLD_C the air temperature itself is returned.
     * @param tempC Temperature in Celsius
     * @param humidity Relative humidity (0-100)
     * @returns Heat index in Celsius, or the original temperature when the
     * heat index is not applicable, or undefined for missing/non-finite input
     */
    public calculateHeatIndex(tempC: number | undefined, humidity: number | undefined): number | undefined {
        if (tempC === undefined || humidity === undefined) {
            return undefined;
        }
        if (!Number.isFinite(tempC) || !Number.isFinite(humidity)) {
            return undefined;
        }

        // Heat index is only calculated for temperatures >= 20°C (68°F)
        // Below this, the air temperature is a good approximation of feels like
        if (tempC < MqttNetworking.HEAT_INDEX_THRESHOLD_C) {
            return tempC;
        }

        // The formulas are defined in Fahrenheit
        const tempF = tempC * 9 / 5 + 32;

        if (tempF >= 80) {
            // Rothfusz regression (NOAA/NWS): 9 terms in T and RH
            let hi =
                -42.379
                + 2.04901523 * tempF
                + 10.14333127 * humidity
                - 0.22475541 * tempF * humidity
                - 0.00683783 * tempF ** 2
                - 0.05481717 * humidity ** 2
                + 0.00122874 * tempF ** 2 * humidity
                + 0.00085282 * tempF * humidity ** 2
                - 0.00000199 * tempF ** 2 * humidity ** 2;

            // Low-humidity correction (RH < 13%, 80°F <= T <= 112°F)
            if (humidity < 13 && tempF <= 112) {
                hi -= ((13 - humidity) / 4) * Math.sqrt((17 - Math.abs(tempF - 95)) / 17);
            }

            // High-humidity correction (RH > 85%, T <= 87°F)
            if (humidity > 85 && tempF <= 87) {
                hi += ((humidity - 85) / 10) * ((87 - tempF) / 5);
            }

            return (hi - 32) * 5 / 9;
        }

        // 20°C–26.67°C (68–80°F): below the regression's applicability range —
        // use the accepted preliminary approximation
        const hi = 0.5 * (tempF + 61.0 + ((tempF - 68.0) * 1.2) + (humidity * 0.094));
        return (hi - 32) * 5 / 9;
    }

    // ********
    // ******** PRIVATE PROPERTIES

    // ----
    private mqtt_client: mqtt.MqttClient;
    private readonly logger: ILogger;
    // ----
    private readonly mqtt_server_ip_address: string;
    public readonly mqtt_topic_command: string;
    private readonly mqtt_topic_command_response: string;
    private readonly mqtt_topic_log: string;
    // ----
    private readonly originator: string;
    // ----
    private readonly forward_sensor_logs: boolean;
    private readonly forward_sensor_logs_level: LogLevel;

    // ---- command silence timeout
    private readonly __command_silence_timeout_ms: number;

    // ********
    // ******** PRIVATE FUNCTIONS

    private connect_to_mqtt_broker(): mqtt.MqttClient {
        const client = mqtt.connect(`mqtt://${this.mqtt_server_ip_address}`, {
            clientId: `dodsonlabs-${sysFunc.randomInt(100000, 999999)}-client-id`,
            clean: true,
            connectTimeout: 10000,
            reconnectPeriod: 5000,
            // Defense in depth: mqtt.js queues QoS-0 publishes while
            // disconnected and delivers them on reconnect. Commands must never
            // execute after their HTTP request has finished — the controller's
            // is_connected() gate handles the API semantics; this drops a
            // publish that loses the race (connected check passes, then the
            // connection drops before publish() runs).
            queueQoSZero: false,
        });

        // ----
        client.on("connect", () => this.on_connect());
        client.on("disconnect", () => this.on_disconnect());
        client.on("error", (err) => this.on_error(err));
        client.on(
            "message",
            (topic: string, payload: Buffer, packet: mqtt.IPublishPacket) =>
                this.on_message(topic, payload, packet)
        );

        // ----
        return client;
    }



    // ****************************************************************
    // ****************************************************************
    // ******** INETWORKLOGGER FUNCTIONS

    public is_connected(): boolean {
        return this.mqtt_client.connected;
    }

    public async close(timeout_ms: number = 5000): Promise<void> {
        this.logger.write_info(this.originator, `<close> => Shutting down MQTT client (timeout: ${timeout_ms}ms)...`);

        // Capture the timeout handle so it can be cleared when the graceful
        // close wins the race. Otherwise the pending timer fires after a
        // successful close and both logs a false "timed out" error and forces
        // end(true) on an already-closed client.
        let timeoutHandle: NodeJS.Timeout | null = null;

        // Close MQTT client with timeout
        const closePromise = new Promise<void>((resolve) => {
            this.mqtt_client.end(() => {
                this.logger.write_info(this.originator, "<close> => MQTT client disconnected.");
                resolve();
            });
        });

        const timeoutPromise = new Promise<void>((resolve) => {
            timeoutHandle = setTimeout(() => {
                this.logger.write_error(
                    this.originator,
                    `<close> => MQTT client close timed out after ${timeout_ms}ms, forcing disconnect.`
                );
                // Force close as a last resort — force=true skips waiting for
                // pending packets to be acknowledged, avoiding the hang.
                this.mqtt_client.end(true, () => resolve());
            }, timeout_ms);
        });

        try {
            await Promise.race([closePromise, timeoutPromise]);
        } finally {
            // Whichever side won, the timer is no longer needed: if the graceful
            // close won it is still pending (clear it so it can't force a
            // disconnect / log a spurious timeout later); if the timeout won the
            // callback already ran (clearTimeout is a harmless no-op).
            if (timeoutHandle) {
                clearTimeout(timeoutHandle);
            }
        }
    }

    public async publish_mqtt_message(topic: string, message: Record<string, unknown>): Promise<void> {

        // Log a safe representation of the message being published (for
        // debugging). A write-config command carries the sensor's complete
        // config — including secrets such as wifi-password / db-password — so
        // for that command we log ONLY operational metadata, never the config.
        // Every other command is logged with its sensitive keys recursively
        // redacted. In all cases the ORIGINAL message (unmodified) is what is
        // actually published: redaction operates on a copy.
        this.logger.write_debug(
            this.originator,
            `<publish_mqtt_message> => Publishing to topic '${topic}': ${this.format_publish_log(message)}`
        );

        try {
            // Await publication completion. With queueQoSZero disabled, a QoS-0
            // command published while the client is disconnected is NOT queued
            // for later delivery — mqtt.js reports that failure ASYNCHRONOUSLY
            // through the publish callback (e.g. "No connection to broker").
            // The previous fire-and-forget call had no callback, so the failure
            // was silently discarded: the command never reached the broker, yet
            // the caller then waited for responses that could never arrive (a
            // false success). Wrapping the callback in a promise makes the
            // failure observable so the caller can fail the request (503).
            await new Promise<void>((resolve, reject) => {
                this.mqtt_client.publish(topic, JSON.stringify(message), (error) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve();
                    }
                });
            });
        } catch (error) {
            const errMessage = `<publish_message> => ${sysFunc.ensureError(error).message}`;
            this.logger.write_error(this.originator, errMessage);
            // Re-throw the ORIGINAL error (not a re-wrapped one) so callers can
            // classify the failure by its message — the disconnect error is what
            // a broker-unavailable 503 keys off of.
            throw error;
        }
    }

    /**
     * Build the debug log representation of an outbound MQTT command message.
     * write-config logs metadata only (command, target, command_id) because its
     * payload holds the full config with secrets; other commands log a
     * recursively-redacted copy. Never mutates the input.
     */
    private format_publish_log(message: Record<string, unknown>): string {
        const command = message["command"];
        if (command !== undefined && String(command).toLowerCase() === "write-config") {
            const meta: Record<string, unknown> = {
                command: "write-config",
                target: message["target"],
                command_id: message["command_id"],
            };
            return JSON.stringify(meta);
        }
        return JSON.stringify(sysFunc.redactSecrets(message));
    }



    // ****************************************************************
    // ****************************************************************
    // ******** MQTT HANDLER FUNCTIONS

    private async on_connect(): Promise<void> {
        // log-it
        this.logger.write_debug(this.originator, "<on_connect> => Connected to the MQTT broker");

        // subscribe to command-response topic for sensor command replies
        this.logger.write_debug(this.originator, `<on_connect> => Subscribing to Topic: ${this.mqtt_topic_command_response}`);
        this.mqtt_client.subscribe(this.mqtt_topic_command_response);

        // subscribe to V3 info-request topic for sensor UTC-time queries
        this.logger.write_debug(this.originator, `<on_connect> => Subscribing to Topic: ${MqttNetworking.MQTT_TOPIC_INFO_REQUEST_V3}`);
        this.mqtt_client.subscribe(MqttNetworking.MQTT_TOPIC_INFO_REQUEST_V3);

        // subscribe to the sensor log topic when log forwarding is enabled
        if (this.forward_sensor_logs) {
            this.logger.write_debug(this.originator, `<on_connect> => Subscribing to Topic: ${this.mqtt_topic_log}`);
            this.mqtt_client.subscribe(this.mqtt_topic_log);
        }
    }

    private on_disconnect(): void {
        this.logger.write_warn(this.originator, "<on_disconnect> => Disconnected from MQTT broker");
    // The mqtt library will auto-reconnect (reconnectPeriod: 5000).
    // When it does, the 'connect' event fires on_connect() which resubscribes.
    }

    /**
     * Topics this client subscribes to. The broker is unauthenticated, so any
     * client on it could publish to any topic — messages on topics we did not
     * subscribe to are forged (e.g. a spoofed command_response) and are
     * dropped before dispatching on message_type.
     */
    private tracked_topics(): string[] {
        const topics = [
            this.mqtt_topic_command_response,
            MqttNetworking.MQTT_TOPIC_INFO_REQUEST_V3,
        ];
        if (this.forward_sensor_logs) {
            topics.push(this.mqtt_topic_log);
        }
        return topics;
    }

    private on_message(
        topic: string,
        payload: Buffer,
        _packet: mqtt.IPublishPacket
    ): void {
        // drop messages on topics this client never subscribed to
        if (!this.tracked_topics().includes(topic)) {
            this.logger.write_warn(
                this.originator,
                `<on_message> => Dropping message on untracked topic '${topic}'`
            );
            return;
        }

        try {
            const json_doc = JSON.parse(payload.toString());
            this.handle_mqtt_message(json_doc).catch((error) => {
                this.logger.write_error(
                    this.originator,
                    `<on_message> => ERROR=${error}`
                );
            });

        } catch (error) {
            this.logger.write_error(
                this.originator,
                `<on_message> => Parse ERROR=${error}`
            );
        }
    }

    private on_error(error: unknown): void {
        this.logger.write_error(
            this.originator,
            `<on_error> => Cannot connect! ERROR=${sysFunc.ensureError(error).message}`
        );
    // The mqtt library will auto-reconnect (reconnectPeriod: 5000).
    // Do NOT call on_connect() here — the client may be in an error state,
    // and calling subscribe() on it would trigger another error event.
    }



    // ****************************************************************
    // ****************************************************************
    // ******** PROCESSING MQTT MESSAGES

    private async handle_mqtt_message(json_doc: unknown): Promise<void> {
    // initialize
        // JSON.parse accepts any JSON value — "null", "42", "[1]" — and the
        // broker is unauthenticated, so the document must be established as
        // a plain object before its envelope fields are read.
        if (typeof json_doc !== "object" || json_doc === null || Array.isArray(json_doc)) {
            this.logger.write_error(this.originator, "<handle_mqtt_message> => Message is not a JSON object, dropping message");
            return;
        }
        const envelope = json_doc as MqttV3Envelope;
        const msg_type_raw = envelope["message_type"];
        if (msg_type_raw === undefined) {
            this.logger.write_error(this.originator, "<handle_mqtt_message> => Missing 'message_type' key, dropping message");
            return;
        }
        const msg_type: string = msg_type_raw.toString();

        // process message by 'message_type'
        switch (msg_type) {
        case "log":
            if (this.forward_sensor_logs) {
                this.handle_mqtt_message_log(envelope);
            }
            break;

        case "command_response":
            this.handle_mqtt_message_command_response(envelope);
            break;

        case "info_request":
            this.handle_mqtt_message_info_request_v3(envelope);
            break;

        default:
            this.logger.write_warn(
                this.originator,
                `<handle_mqtt_message> => Unknown message_type '${msg_type}', dropping message`
            );
        }
    }



    // ****************************************************************
    // ****************************************************************
    // ******** HANDLE MQTT LOG MESSAGES

    private handle_mqtt_message_log(json_doc: MqttV3Envelope): void {
        this.logger.write_debug(this.originator, "<handle_message_log>: message_type: LOG");

        // V3 log messages nest level/message/event/module in payload; fall back
        // to top level for anything that isn't in the documented shape
        const raw_log_payload = json_doc["payload"];
        const log_payload: Record<string, unknown> =
            raw_log_payload !== null && typeof raw_log_payload === "object" && !Array.isArray(raw_log_payload)
                ? raw_log_payload as Record<string, unknown>
                : {};

        const source = json_doc["source"] ?? "unknown";
        const level = log_payload["level"] ?? json_doc["level"] ?? "info";
        const message = log_payload["message"] ?? json_doc["message"] ?? json_doc;

        // Gate: only forward if the sensor's log level meets the configured threshold
        const sensor_level = this.sensor_log_level_to_enum(String(level).toLowerCase());
        if (sensor_level < this.forward_sensor_logs_level) {
            return;
        }

        // Include the V3 event/module metadata when present
        let detail = JSON.stringify(message);
        const event = log_payload["event"];
        const module = log_payload["module"];
        if (event !== undefined || module !== undefined) {
            detail = `event='${event ?? ""}' module='${module ?? ""}' ${detail}`;
        }

        // Forward sensor log messages to the application logger at the appropriate level
        const logMessage = `[${source}] ${detail}`;

        switch (sensor_level) {
        case LogLevel.Error:
            this.logger.write_error("MqttNetworking::log", logMessage);
            break;
        case LogLevel.Warn:
            this.logger.write_warn("MqttNetworking::log", logMessage);
            break;
        case LogLevel.Debug:
            this.logger.write_debug("MqttNetworking::log", logMessage);
            break;
        default:
            this.logger.write_info("MqttNetworking::log", logMessage);
        }
    }

    /**
     * Map a sensor log level string to the internal LogLevel enum.
     * Accepts aliases like "err"/"wrn"/"dbg" and falls back to Info for unknown values.
     */
    private sensor_log_level_to_enum(level: string): LogLevel {
        switch (level) {
        case "error":
        case "err":
            return LogLevel.Error;
        case "warn":
        case "wrn":
            return LogLevel.Warn;
        case "debug":
        case "dbg":
            return LogLevel.Debug;
        default:
            return LogLevel.Info;
        }
    }





    // ****************************************************************
    // ****************************************************************
    // ******** HANDLE MQTT COMMAND RESPONSE MESSAGES

    // Known command types supported by the firmware v4 (V3) protocol — only
    // these are allowed in cr_dude_dict. Keeping this as a constant prevents
    // unbounded growth if an unknown command slips through the if/else chain
    // in handle_mqtt_message_command_response.
    private readonly known_command_types: Set<string> = new Set([
        "get-details",
        "read-config",
        "write-config",
        "reboot",
    ]);

    private cr_dude_dict: Record<string, IMqttCommandControl> = {};

    /**
     * Get (or lazily create) the MqttCommandControl for a command type.
     * Only known command types are accepted — unknown types trigger a
     * warning and return null, preventing unbounded map growth.
     */
    public get_cr_dude(key: string): IMqttCommandControl | null {
        if (!(key in this.cr_dude_dict)) {
            if (!this.known_command_types.has(key)) {
                this.logger.write_warn(
                    this.originator,
                    `<get_cr_dude> => Unknown command type '${key}', ignoring`
                );
                return null;
            }
            this.cr_dude_dict[key] = new MqttCommandControl(this.__command_silence_timeout_ms);
        }
        return this.cr_dude_dict[key];
    }

    // --------------------------------

    /**
     * Get a value from an object using snake_case field names (V2 format).
     * Supports both snake_case and camelCase for backward compatibility.
     */
    private getField(obj: Record<string, unknown>, ...fieldNames: string[]): unknown {
        for (const fieldName of fieldNames) {
            const value = obj[fieldName];
            if (value !== undefined && value !== null) {
                return value;
            }
        }
        return undefined;
    }

    private handle_mqtt_message_command_response(
        json_doc: MqttV3Envelope
    ): void {

        const source_raw = this.getField(json_doc, "source");
        if (source_raw === undefined) {
            this.logger.write_error(this.originator, "<handle_mqtt_message_command_response> => Missing 'source' key, dropping message");
            return;
        }
        const source = String(source_raw);

        const raw_payload = json_doc["payload"];
        if (raw_payload === null || typeof raw_payload !== "object" || Array.isArray(raw_payload)) {
            this.logger.write_error(this.originator, "<handle_mqtt_message_command_response> => Missing or invalid 'payload' object, dropping message");
            return;
        }
        // The guards above establish a plain object; the cast records the
        // variant's shape for the field reads below
        const payload: Record<string, unknown> = raw_payload as Record<string, unknown>;

        // V3: the command name lives in payload.command (no top-level 'type' field)
        const cmd_type_raw = this.getField(payload, "command");
        if (cmd_type_raw === undefined || typeof cmd_type_raw !== "string") {
            this.logger.write_error(this.originator, "<handle_mqtt_message_command_response> => Missing 'payload.command' in message, dropping message");
            return;
        }
        const cmd_type = cmd_type_raw.toLowerCase();

        // V3: command_id lives inside payload (normalize at the origin — the
        // protocol id is a UUID; a non-string here is a protocol violation)
        const raw_command_id = this.getField(payload, "command_id");
        const command_id: string | undefined = raw_command_id !== undefined ? String(raw_command_id) : undefined;

        // Log with a redacted deep copy so credentials never reach the logs.
        // redactSecrets() masks sensitive keys (wifi-password, password,
        // db-password) at ANY nesting depth — the config may live at
        // payload.config, payload.data.config, or elsewhere — and returns a new
        // object, so the original json_doc (still used for command_id
        // correlation below) is never mutated.
        const sanitizedDoc = sysFunc.redactSecrets(json_doc);
        this.logger.write_debug(this.originator, `<handle_mqtt_message_command_response>: ${cmd_type} from '${source}': ${JSON.stringify(sanitizedDoc)}`);

        // ----
        if (cmd_type === "reboot") {
            const dude = this.get_cr_dude("reboot");
            if (dude !== null) {
                this.handle_mqtt_command_response_reboot(dude, source, payload, json_doc, command_id);
            }
            // ----
        } else if (cmd_type === "get-details" || cmd_type === "read-config" || cmd_type === "write-config") {
            const dude = this.get_cr_dude(cmd_type);
            if (dude !== null) {
                this.handle_mqtt_command_response_message(dude, source, payload, json_doc, command_id);
            }

        } else {
            this.logger.write_warn(
                this.originator,
                `<handle_mqtt_message_command_response> => Unknown command type '${cmd_type}' from source '${source}', dropping`
            );
        }
    }

    // ********
    // ******** HANDLE RESPONSE MESSAGE

    /**
     * Correlate a command response with the active request. One active
     * command_id may receive responses from multiple sensors, but a response
     * carrying any other command_id — or arriving when no command is active —
     * must not enter the active result set or restart its silence timer
     * (a delayed response from a previous command must not resurrect it).
     */
    private accepts_command_response(
        dude: IMqttCommandControl,
        source: string,
        command_id?: string
    ): boolean {
        const normalized = command_id !== undefined && command_id !== null ? String(command_id) : undefined;

        if (!dude.is_running) {
            this.logger.write_debug(
                this.originator,
                `<command_response> => Ignoring response from '${source}': no active command`
            );
            return false;
        }
        if (normalized === undefined || dude.active_command_id === undefined || normalized !== dude.active_command_id) {
            this.logger.write_debug(
                this.originator,
                `<command_response> => Ignoring response from '${source}': command_id '${normalized}' does not match active command_id '${dude.active_command_id}'`
            );
            return false;
        }
        return true;
    }

    private handle_mqtt_command_response_message(
        dude: IMqttCommandControl,
        source: string,
        payload: Record<string, unknown>,
        json_doc: MqttV3Envelope,
        command_id?: string
    ): void {
        if (!this.accepts_command_response(dude, source, command_id)) {
            return;
        }

        // create the result and record it
        dude.results.push(this.create_command_result(source, payload, json_doc, command_id));

        // start a new timer
        dude.restart_clock();
    }

    /**
     * Build a MqttCommandResult from a V3 command_response message.
     * The firmware's payload object (command_id/targeted/command/success/data|error)
     * is passed through verbatim; envelope fields are mapped onto the result.
     */
    private create_command_result(
        source: string,
        payload: Record<string, unknown>,
        json_doc: MqttV3Envelope,
        command_id?: string
    ): MqttCommandResult {
        // V3 metadata: targeted and command_id live in payload, the rest in the envelope
        const targeted = this.getField(payload, "targeted");
        const schema_version = this.getField(json_doc, "message_schema_version");
        const firmware_version = this.getField(json_doc, "firmware_version");
        const uptime_ms = this.getNumericField(json_doc, "uptime_ms");
        const timestamp = this.getField(json_doc, "timestamp");
        const sequence = this.getNumericField(json_doc, "sequence");
        const runtime_id = this.getField(json_doc, "runtime_id");

        // Add calculated feels-like temperature to air data if not already present
        const enrichedPayload = this.enrichAirDataWithFeelsLike(payload);

        // Create result with optional command_id and V3 metadata
        const result: MqttCommandResult = {
            source: source,
            payload: enrichedPayload,
        };

        const payload_command_id = this.getField(payload, "command_id");
        const result_command_id = command_id ?? (payload_command_id !== undefined ? String(payload_command_id) : undefined);
        if (result_command_id !== undefined) {
            result.command_id = result_command_id;
        }

        // Add V3 response fields if present
        if (targeted !== undefined) {
            result.targeted = Boolean(targeted);
        }
        if (schema_version !== undefined) {
            result.schema_version = Number(schema_version);
        }
        if (firmware_version !== undefined) {
            result.firmware_version = String(firmware_version);
        }
        if (uptime_ms !== undefined) {
            result.uptime_ms = uptime_ms;
        }
        if (timestamp !== undefined && timestamp !== null) {
            result.timestamp = String(timestamp);
        }
        if (sequence !== undefined) {
            result.sequence = sequence;
        }
        if (runtime_id !== undefined) {
            result.runtime_id = String(runtime_id);
        }

        return result;
    }

    // ********
    // ******** HELPER METHODS

    /**
     * Get a numeric value from an object using V2 snake_case field names.
     * For time-related fields (milliseconds), truncates to integer.
     * Returns undefined if not found or not a valid finite number.
     */
    private getNumericField(obj: Record<string, unknown>, ...fieldNames: string[]): number | undefined {
        for (const fieldName of fieldNames) {
            const value = obj[fieldName];
            if (value !== undefined && value !== null) {
                const numValue = Number(value);
                if (Number.isFinite(numValue)) {
                    // Truncate to integer for millisecond time fields
                    if (fieldName.includes('time') || fieldName.includes('Time') ||
                        fieldName.includes('millis') || fieldName.includes('Millis')) {
                        return Math.trunc(numValue);
                    }
                    return numValue;
                }
            }
        }
        return undefined;
    }

    /**
     * Enrich air data with calculated feels-like temperature.
     * Adds 'feels_like_c' field if both temperature_c and humidity_percent are present
     * and the temperature is above the heat index threshold.
     * Used to enhance sensor command responses with calculated values.
     * @param payload The original payload
     * @returns A new payload with enriched air data
     */
    private enrichAirDataWithFeelsLike(payload: Record<string, unknown>): Record<string, unknown> {
        // Deep clone to avoid mutating the original payload
        const enrichedPayload = structuredClone(payload);

        // 'air' is an untrusted nested value — establish it as a plain
        // object before indexing
        const raw_air = enrichedPayload["air"];
        if (raw_air === null || typeof raw_air !== "object" || Array.isArray(raw_air)) {
            return enrichedPayload;
        }
        const air: Record<string, unknown> = raw_air as Record<string, unknown>;

        // If feels-like is already present, don't recalculate
        if (air["feels_like_c"] !== undefined) {
            return enrichedPayload;
        }

        const tempC = Number(air["temperature_c"]);
        const humidity = Number(air["humidity_percent"]);

        // Only calculate if we have valid numeric values
        if (!Number.isFinite(tempC) || !Number.isFinite(humidity)) {
            return enrichedPayload;
        }

        // Calculate feels-like temperature
        const feelsLikeC = this.calculateHeatIndex(tempC, humidity);

        if (feelsLikeC !== undefined) {
            // Round to 4 decimal places for consistency
            air["feels_like_c"] = Math.round(feelsLikeC * 10000) / 10000;
        }

        return enrichedPayload;
    }

    // ********
    // ******** HANDLE REBOOT RESPONSE MESSAGE

    private handle_mqtt_command_response_reboot(
        dude: IMqttCommandControl,
        source: string,
        payload: Record<string, unknown>,
        json_doc: MqttV3Envelope,
        command_id?: string
    ): void {
        if (!this.accepts_command_response(dude, source, command_id)) {
            return;
        }

        // create the result and record it
        dude.results.push(this.create_command_result(source, payload, json_doc, command_id));

        // start a new timer
        dude.restart_clock();
    }

    // ****************************************************************
    // ****************************************************************
    // ******** HANDLE INFO REQUEST MESSAGES (sensor-to-server)

    /**
     * Handle V3 info_request from sensors.
     * The firmware publishes info_request on iot/v3/info-request to query
     * the server for UTC time. Only supports utc_time request_type.
     */
    private handle_mqtt_message_info_request_v3(json_doc: MqttV3Envelope): void {
        // Validate message_schema_version == 3
        const schema_version = json_doc["message_schema_version"];
        if (schema_version !== 3) {
            this.logger.write_warn(
                this.originator,
                `<handle_mqtt_message_info_request_v3> => Invalid message_schema_version: ${schema_version}, expected 3`
            );
            return;
        }

        // Validate source (non-empty string)
        const source_raw = json_doc["source"];
        if (source_raw === undefined || source_raw === null || typeof source_raw !== "string" || source_raw.trim() === "") {
            this.logger.write_warn(
                this.originator,
                `<handle_mqtt_message_info_request_v3> => Invalid or missing 'source', dropping`
            );
            return;
        }
        const source = source_raw.trim();

        // Validate request_id (non-empty string)
        const request_id_raw = json_doc["request_id"];
        if (request_id_raw === undefined || request_id_raw === null || typeof request_id_raw !== "string" || request_id_raw.trim() === "") {
            this.logger.write_warn(
                this.originator,
                `<handle_mqtt_message_info_request_v3> => Invalid or missing 'request_id', dropping`
            );
            return;
        }
        const request_id = request_id_raw.trim();

        // Validate request_type
        const request_type_raw = json_doc["request_type"];
        if (request_type_raw === undefined || request_type_raw === null || typeof request_type_raw !== "string") {
            this.logger.write_warn(
                this.originator,
                `<handle_mqtt_message_info_request_v3> => Invalid or missing 'request_type', dropping`
            );
            return;
        }
        const request_type = request_type_raw.trim();

        // Validate payload (must be non-null object with no keys)
        const payload = json_doc["payload"];
        if (
            payload === null ||
            typeof payload !== "object" ||
            Array.isArray(payload) ||
            Object.keys(payload).length !== 0
        ) {
            this.logger.write_warn(
                this.originator,
                `<handle_mqtt_message_info_request_v3> => Invalid payload, expected empty object, dropping`
            );
            return;
        }

        // Log the request
        this.logger.write_debug(
            this.originator,
            `<handle_mqtt_message_info_request_v3>: request_type='${request_type}' from '${source}'`
        );

        // Only utc_time is supported for this compatibility bridge
        if (request_type !== "utc_time") {
            this.logger.write_warn(
                this.originator,
                `<handle_mqtt_message_info_request_v3> => Unknown request_type '${request_type}', dropping`
            );
            return;
        }

        // Generate UTC timestamp using the same mechanism as V2
        const now = new Date();
        const response_payload = {
            timestamp: now.toISOString(),
            utc_epoch_ms: Math.trunc(now.getTime()),
        };

        // Build V3 response header
        const response_header: Record<string, unknown> = {
            "message_type": "info_response",
            "message_schema_version": 3,
            "source": "server",
            "target": source,
            "request_id": request_id,
            "request_type": request_type,
        };

        // Send response to V3 topic. Fire-and-forget: this is a best-effort
        // reply to a sensor's UTC-time query, so a publish failure is logged but
        // not propagated. publish_mqtt_message now reports failures
        // asynchronously, so the rejection is handled here.
        this.publish_mqtt_message(MqttNetworking.MQTT_TOPIC_INFO_RESPONSE_V3, {
            ...response_header,
            payload: response_payload,
        }).catch((error) => {
            this.logger.write_error(
                this.originator,
                `<handle_mqtt_message_info_request_v3> => Failed to send response: ${sysFunc.ensureError(error).message}`
            );
        });
    }
}
