/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import mqtt from "mqtt";
import * as sysFunc from "./SystemFunctions";
import { LogLevel } from "./Interfaces";
import type { ILogger, IMqttCommandControl, IMqttNetworking } from "./Interfaces";
import { MqttCommandControl } from "./MqttCommandControl";
import type { configSchema } from "../schemas/config";
import type { z } from "zod";



export class MqttNetworking implements IMqttNetworking {

    // ********
    // ******** CONSTANTS

    // Heat index calculation threshold (Celsius)
    // Below this temperature, feels-like equals actual temperature
    private static readonly HEAT_INDEX_THRESHOLD_C: number = 20;

    // ********
    // ******** CTOR

    constructor(config: z.infer<typeof configSchema>, logger: ILogger) {

        // save parameters
        this.mqtt_server_ip_address = config["mqtt-broker-ip-address"];
        this.mqtt_topic_command = config["mqtt-topic-command"];
        this.mqtt_topic_command_response = config["mqtt-topic-command-response"];
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
     * Uses the Rothfusz regression formula.
     * @param tempC Temperature in Celsius
     * @param humidity Relative humidity (0-100)
     * @returns Heat index in Celsius (4 decimal places), or original temp if conditions are not suitable
     */
    public calculateHeatIndex(tempC: number | undefined, humidity: number | undefined): number | undefined {
        if (tempC === undefined || humidity === undefined) {
            return undefined;
        }

        // Heat index is only calculated for temperatures >= 20°C (68°F)
        // Below this, the air temperature is a good approximation of feels like
        if (tempC < MqttNetworking.HEAT_INDEX_THRESHOLD_C) {
            return tempC;
        }

        // Convert Celsius to Fahrenheit for the formula
        const tempF = tempC * 9 / 5 + 32;

        // Rothfusz regression formula
        let hi = 0.5 * (tempF + 61.0 + ((tempF - 68.0) * 1.2) + (humidity * 0.094));

        // Apply adjustment for high humidity and high temperature
        if (hi > 79) {
            hi += -0.1 * (humidity - 85) * (107 - tempF) * 0.0001;
        }

        // Return result in Celsius
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
    // ----
    private readonly originator: string;
    // ----
    private readonly forward_sensor_logs: boolean;
    private readonly forward_sensor_logs_level: LogLevel;

    // ---- command deduplication
    private readonly seen_command_ids: Map<string, number> = new Map();
    private readonly __dedup_ttl_ms = 60_000; // 1 minute TTL for command IDs
    private readonly __dedup_max_size = 10_000; // cap to prevent unbounded growth

    // ---- command silence timeout
    private readonly __command_silence_timeout_ms: number;

    // ********
    // ******** PRIVATE FUNCTIONS

    // ---- command deduplication

    /**
   * Register a command ID for deduplication tracking.
   * Returns true if this is a new (non-duplicate) command ID.
   * Uses a bounded map: when full, evicts the oldest entry (O(1)).
   */
    register_command_id(command_id: string): boolean {
        if (this.seen_command_ids.has(command_id)) {
            return false;
        }

        // Evict oldest entry when at capacity to prevent unbounded growth
        if (this.seen_command_ids.size >= this.__dedup_max_size) {
            const firstKey = this.seen_command_ids.keys().next().value;
            if (firstKey !== undefined) {
                this.seen_command_ids.delete(firstKey);
            }
        }

        this.seen_command_ids.set(command_id, Date.now());
        return true;
    }

    /**
   * Check if a command ID has already been seen (duplicate).
   * Expired entries are cleaned up lazily at lookup time.
   */
    private is_duplicate_command(command_id: string): boolean {
        const timestamp = this.seen_command_ids.get(command_id);
        if (timestamp === undefined) {
            return false;
        }
        // Expired — evict and treat as new
        if (Date.now() - timestamp > this.__dedup_ttl_ms) {
            this.seen_command_ids.delete(command_id);
            return false;
        }
        return true;
    }

    private connect_to_mqtt_broker(): mqtt.MqttClient {
        const client = mqtt.connect(`mqtt://${this.mqtt_server_ip_address}`, {
            clientId: `dodsonlabs-${sysFunc.randomInt(100000, 999999)}-client-id`,
            clean: true,
            connectTimeout: 10000,
            reconnectPeriod: 5000,
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

        // Close MQTT client with timeout
        const closePromise = new Promise<void>((resolve) => {
            this.mqtt_client.end(() => {
                this.logger.write_info(this.originator, "<close> => MQTT client disconnected.");
                resolve();
            });
        });

        const timeoutPromise = new Promise<void>((resolve) => {
            setTimeout(() => {
                this.logger.write_error(
                    this.originator,
                    `<close> => MQTT client close timed out after ${timeout_ms}ms, forcing disconnect.`
                );
                // Force close as a last resort — force=true skips waiting for
                // pending packets to be acknowledged, avoiding the hang.
                this.mqtt_client.end(true, () => resolve());
            }, timeout_ms);
        });

        await Promise.race([closePromise, timeoutPromise]);
    }

    public publish_mqtt_message(topic: string, message: Record<string, any>): void {

        // Outbound command deduplication: reject duplicate command IDs before publishing.
        const command_id = message["command-id"];
        if (command_id !== undefined) {
            const cid = String(command_id);
            if (this.is_duplicate_command(cid)) {
                this.logger.write_debug(
                    this.originator,
                    `<publish_mqtt_message> => Duplicate command-id '${command_id}', skipping publish`
                );
                return;
            }
            // Register for future dedup checks (bounded map, O(1) eviction).
            this.register_command_id(cid);
        }

        // Log the message being published (for debugging)
        this.logger.write_debug(
            this.originator,
            `<publish_mqtt_message> => Publishing to topic '${topic}': ${JSON.stringify(message)}`
        );

        try {
            this.mqtt_client.publish(topic, JSON.stringify(message));
        } catch (error) {
            const errMessage = `<publish_message> => ${sysFunc.ensureError(error).message}`;
            this.logger.write_error(this.originator, errMessage);
            throw new Error(errMessage);
        }
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
    }

    private on_disconnect(): void {
        this.logger.write_warn(this.originator, "<on_disconnect> => Disconnected from MQTT broker");
    // The mqtt library will auto-reconnect (reconnectPeriod: 5000).
    // When it does, the 'connect' event fires on_connect() which resubscribes.
    }

    private on_message(
        _topic: string,
        payload: Buffer,
        _packet: mqtt.IPublishPacket
    ): void {
        try {
            this.handle_mqtt_message(JSON.parse(payload.toString())).catch((error) => {
                this.logger.write_error(
                    this.originator,
                    `<on_message> => ERROR=${error}`
                );
            });

        } catch (error) {
            this.logger.write_error(
                this.originator,
                `<on_message> => ERROR=${error}`
            );
        }
    }

    private on_error(error: any): void {
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

    private async handle_mqtt_message(json_doc: any): Promise<void> {
    // initialize
        const msg_type_raw = json_doc["message-type"];
        if (msg_type_raw === undefined) {
            this.logger.write_error(this.originator, "<handle_mqtt_message> => Missing 'message-type' key, dropping message");
            return;
        }
        const msg_type: string = msg_type_raw.toString();

        // process message by 'message-type'
        switch (msg_type) {
        case "log":
            if (this.forward_sensor_logs) {
                this.handle_mqtt_message_log(json_doc);
            }
            break;

        case "command-response":
            this.handle_mqtt_message_command_response(json_doc);
            break;

        default:
            this.logger.write_warn(
                this.originator,
                `<handle_mqtt_message> => Unknown message-type '${msg_type}', dropping message`
            );
        }
    }



    // ****************************************************************
    // ****************************************************************
    // ******** HANDLE MQTT LOG MESSAGES

    private handle_mqtt_message_log(json_doc: any): void {
        this.logger.write_debug(this.originator, "<handle_message_log>: message-type: LOG");

        const source = json_doc["source"] ?? "unknown";
        const level = json_doc["level"] ?? "info";
        const message = json_doc["message"] ?? json_doc;

        // Gate: only forward if the sensor's log level meets the configured threshold
        const sensor_level = this.sensor_log_level_to_enum(String(level).toLowerCase());
        if (sensor_level < this.forward_sensor_logs_level) {
            return;
        }

        // Forward sensor log messages to the application logger at the appropriate level
        const logMessage = `[${source}] ${JSON.stringify(message)}`;

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

    // Known command-response types — only these are allowed in cr_dude_dict.
    // Keeping this as a constant prevents unbounded growth if an unknown
    // msg_type slips through the if/else chain in handle_mqtt_message_command_response.
    private readonly known_command_types: Set<string> = new Set([
        "identify",
        "get-details",
        "read-config",
        "write-config",
        "update-config",
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

    private handle_mqtt_message_command_response(
        json_doc: Record<string, any>
    ): void {

        // init
        const type_raw = json_doc["type"];
        if (type_raw === undefined) {
            this.logger.write_error(this.originator, "<handle_mqtt_message_command_response> => Missing 'type' key, dropping message");
            return;
        }
        const msg_type = String(type_raw).toLowerCase();

        const source_raw = json_doc["source"];
        if (source_raw === undefined) {
            this.logger.write_error(this.originator, "<handle_mqtt_message_command_response> => Missing 'source' key, dropping message");
            return;
        }
        const source = String(source_raw);

        const payload = json_doc["payload"];

        // Extract command_id for deduplication
        const command_id = json_doc["command-id"];

        // log-it
        this.logger.write_debug(this.originator, `<handle_mqtt_message_command_response>: \n${JSON.stringify(json_doc)}`);

        // ---- command deduplication check (skip adding results for duplicates)
        if (command_id !== undefined && this.is_duplicate_command(String(command_id))) {
            this.logger.write_debug(
                this.originator,
                `<handle_mqtt_message_command_response> => Duplicate command-id '${command_id}' for type '${msg_type}', skipping`
            );
            return;
        }

        // ----
        if (msg_type === "identify") {
            this.handle_mqtt_command_response_message(this.get_cr_dude("identify")!, source, payload);
            // ----
        } else if (msg_type === "get-details") {
            this.handle_mqtt_command_response_message(this.get_cr_dude("get-details")!, source, payload);
            // ----
        } else if (msg_type === "read-config") {
            this.handle_mqtt_command_response_message(this.get_cr_dude("read-config")!, source, payload);
            // ----
        } else if (msg_type === "write-config") {
            this.handle_mqtt_command_response_message(this.get_cr_dude("write-config")!, source, payload);
            // ----
        } else if (msg_type === "update-config") {
            this.handle_mqtt_command_response_message(this.get_cr_dude("update-config")!, source, payload);
            // ----
        } else if (msg_type === "reboot") {
            this.handle_mqtt_command_response_reboot(this.get_cr_dude("reboot")!, source, payload);

        } else {
            this.logger.write_warn(
                this.originator,
                `<handle_mqtt_message_command_response> => Unknown command-response type '${msg_type}' from source '${source}', dropping`
            );
        }
    }

    // ********
    // ******** HANDLE RESPONSE MESSAGE

    private handle_mqtt_command_response_message(
        dude: IMqttCommandControl,
        source: string,
        payload: Record<string, any>
    ) {
        // Add calculated feels-like temperature to air data if not already present
        const enrichedPayload = this.enrichAirDataWithFeelsLike(payload);

        // add response to collection
        dude.results.push({
            source: source,
            payload: enrichedPayload,
        });

        // start a new timer
        dude.restart_clock();
    }

    // ********
    // ******** HELPER METHODS

    /**
     * Enrich air data with calculated feels-like temperature.
     * Adds 'feels-like-c' field if both temperature-c and humidity-percent are present
     * and the temperature is above the heat index threshold.
     * Used to enhance sensor command responses with calculated values.
     * @param payload The original payload
     * @returns A new payload with enriched air data
     */
    private enrichAirDataWithFeelsLike(payload: Record<string, any>): Record<string, any> {
        // Deep clone to avoid mutating the original payload
        const enrichedPayload = structuredClone(payload);

        const air = enrichedPayload?.["air"];
        if (!air) {
            return enrichedPayload;
        }

        // If feels-like is already present, don't recalculate
        if (air["feels-like-c"] !== undefined) {
            return enrichedPayload;
        }

        const tempC = Number(air["temperature-c"]);
        const humidity = Number(air["humidity-percent"]);

        // Only calculate if we have valid numeric values
        if (!Number.isFinite(tempC) || !Number.isFinite(humidity)) {
            return enrichedPayload;
        }

        // Calculate feels-like temperature
        const feelsLikeC = this.calculateHeatIndex(tempC, humidity);

        if (feelsLikeC !== undefined) {
            // Round to 4 decimal places for consistency
            air["feels-like-c"] = Math.round(feelsLikeC * 10000) / 10000;
        }

        return enrichedPayload;
    }

    // ********
    // ******** HANDLE REBOOT RESPONSE MESSAGE

    private handle_mqtt_command_response_reboot(
        dude: IMqttCommandControl,
        source: string,
        payload: Record<string, any>
    ) {
    // add response to collection
        dude.results.push({ source, payload });

        // start a new timer
        dude.restart_clock();
    }
}
