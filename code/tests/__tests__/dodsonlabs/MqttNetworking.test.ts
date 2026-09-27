/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import { MqttNetworking } from "../../../src/dodsonlabs/MqttNetworking";
import { LogLevel } from "../../../src/dodsonlabs/Interfaces";

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface TestLogger {
    global_log_level(): LogLevel;
    global_log_level_string(): string;
    write_info(originator: string, message: string): void;
    write_warn(originator: string, message: string): void;
    write_error(originator: string, message: string): void;
    write_debug(originator: string, message: string): void;
}

function createTestLogger(): TestLogger {
    return {
        global_log_level: () => LogLevel.Debug,
        global_log_level_string: () => "debug",
        write_info: jest.fn(),
        write_warn: jest.fn(),
        write_error: jest.fn(),
        write_debug: jest.fn(),
    };
}

describe("MqttNetworking", () => {
    let networking: MqttNetworking;
    let logger: TestLogger;

    beforeEach(() => {
        logger = createTestLogger();

        // Build a minimal config
        const config = {
            "mqtt-broker-ip-address": "127.0.0.1",
            "mqtt-topic-command": "iot/v2/command",
            "mqtt-topic-command-response": "iot/v2/command-response",
            "ip-pinger-web-api": "http://127.0.0.1:3300",
            "case-sensitive": true,
        } as any;

        // MqttNetworking will try to connect to MQTT; that's fine — we only test the non-networking parts.
        networking = new MqttNetworking(config, logger);
    });

    afterEach(() => {
        // Best-effort cleanup — won't succeed without a real broker, but avoids leaks.
        networking.close(1000).catch(() => {});
    });

    // ---- outbound command deduplication

    it("should skip publish when a duplicate command-id is sent", () => {
        const anyNetworking = networking as any;
        const seenIds = anyNetworking.seen_command_ids;
        const sizeBefore = seenIds.size;

        const msg = {
            "message_type": "command",
            "command_id": "dedup-test-1",
            "command": "identify",
        };

        // First publish: command-id not yet seen, should register and publish
        networking.publish_mqtt_message("iot/v2/command", msg);
        expect(seenIds.has("dedup-test-1")).toBe(true);

        // Second publish with the same command-id: should be rejected
        networking.publish_mqtt_message("iot/v2/command", msg);
        // Map size stays the same — no duplicate registration
        expect(seenIds.size).toBe(sizeBefore + 1);
    });

    it("should allow publish when command-id differs", () => {
        const anyNetworking = networking as any;
        const seenIds = anyNetworking.seen_command_ids;
        const sizeBefore = seenIds.size;

        networking.publish_mqtt_message("iot/v2/command", {
            "message_type": "command",
            "command_id": "dedup-test-2a",
            "command": "identify",
        });
        networking.publish_mqtt_message("iot/v2/command", {
            "message_type": "command",
            "command_id": "dedup-test-2b",
            "command": "identify",
        });

        // Two new IDs registered
        expect(seenIds.size).toBe(sizeBefore + 2);
    });

    it("should allow publish when no command-id is present", () => {
        const anyNetworking = networking as any;
        const seenIds = anyNetworking.seen_command_ids;
        const sizeBefore = seenIds.size;

        networking.publish_mqtt_message("iot/v2/command", {
            "message_type": "command",
            "command": "identify",
        });
        networking.publish_mqtt_message("iot/v2/command", {
            "message_type": "command",
            "command": "identify",
        });

        // No command-id means no registration — size unchanged
        expect(seenIds.size).toBe(sizeBefore);
    });

    it("should evict oldest entry when dedup map reaches capacity", () => {
        const anyNetworking = networking as any;
        const seenIds = anyNetworking.seen_command_ids;
        const maxCapacity = anyNetworking.__dedup_max_size;

        // Clear pre-existing entries so we start from zero
        seenIds.clear();

        // Fill to capacity
        for (let i = 0; i < maxCapacity; i++) {
            networking.publish_mqtt_message("iot/v2/command", {
                "message_type": "command",
                "command_id": `cap-dedup-${i}`,
                "command": "identify",
            });
        }
        expect(seenIds.size).toBe(maxCapacity);

        // Next insert evicts oldest, size stays at cap
        networking.publish_mqtt_message("iot/v2/command", {
            "message_type": "command",
            "command_id": "cap-dedup-new",
            "command": "identify",
        });
        expect(seenIds.size).toBe(maxCapacity);
        expect(seenIds.has("cap-dedup-new")).toBe(true);
        expect(seenIds.has("cap-dedup-0")).toBe(false);
    });

    // ---- unknown command type rejection (M1: cr_dude_dict never evicts)

    it("should reject unknown command types in get_cr_dude", () => {
        const anyNetworking = networking as any;
        const result = networking.get_cr_dude("unknown-type");

        expect(result).toBeNull();
        expect(logger.write_warn).toHaveBeenCalledWith(
            "networking",
            expect.stringContaining("Unknown command type 'unknown-type'")
        );

        // Known types should still work
        const knownResult = networking.get_cr_dude("identify");
        expect(knownResult).not.toBeNull();
    });

    it("should not create cr_dude_dict entries for unknown command types", () => {
        const anyNetworking = networking as any;
        const dictBefore = { ...anyNetworking.cr_dude_dict };

        networking.get_cr_dude("bogus-command");

        const dictAfter = anyNetworking.cr_dude_dict;
        expect(dictAfter).toEqual(dictBefore); // no new entry created
    });

    // ---- V3 UTC info-request tests

    it("should handle valid V3 utc_time request and publish response", () => {
        const anyNetworking = networking as any;

        // Mock the publish_mqtt_message to capture calls
        const originalPublish = anyNetworking.publish_mqtt_message.bind(anyNetworking);
        const publishedMessages: Array<{ topic: string; message: any }> = [];
        anyNetworking.publish_mqtt_message = (topic: string, message: any) => {
            publishedMessages.push({ topic, message });
        };

        // Valid V3 utc_time request
        const request = {
            "message_type": "info_request",
            "message_schema_version": 3,
            "source": "Test-Pico-1",
            "request_id": "utc-test-001",
            "request_type": "utc_time",
            "payload": {},
        };

        anyNetworking.handle_mqtt_message_info_request_v3(request);

        // Verify exactly one publication
        expect(publishedMessages.length).toBe(1);
        const [publication] = publishedMessages;

        // Verify topic
        expect(publication.topic).toBe("iot/v3/info-response");

        // Verify response message
        const response = publication.message;
        expect(response["message_type"]).toBe("info_response");
        expect(response["message_schema_version"]).toBe(3);
        expect(response["source"]).toBe("server");
        expect(response["request_id"]).toBe("utc-test-001");
        expect(response["request_type"]).toBe("utc_time");

        // Verify payload
        const payload = response["payload"];
        expect(payload).toBeDefined();
        expect(payload["timestamp"]).toBeDefined();
        expect(payload["utc_epoch_ms"]).toBeDefined();

        // Verify timestamp is valid ISO string
        const timestamp = payload["timestamp"];
        expect(new Date(timestamp).toISOString()).toBe(timestamp);

        // Verify utc_epoch_ms is a valid timestamp
        expect(typeof payload["utc_epoch_ms"]).toBe("number");
        expect(payload["utc_epoch_ms"]).toBeGreaterThan(0);
    });

    it("should reject V3 request with invalid message_schema_version", () => {
        const anyNetworking = networking as any;

        let errorMessage = "";
        anyNetworking.publish_mqtt_message = (topic: string, message: any) => {
            errorMessage = `Unexpected publication: ${topic}`;
        };

        const request = {
            "message_type": "info_request",
            "message_schema_version": 2, // Invalid - should be 3
            "source": "Test-Pico-1",
            "request_id": "utc-test-002",
            "request_type": "utc_time",
            "payload": {},
        };

        anyNetworking.handle_mqtt_message_info_request_v3(request);

        expect(errorMessage).toBe("");
    });

    it("should reject V3 request with missing source", () => {
        const anyNetworking = networking as any;

        let errorMessage = "";
        anyNetworking.publish_mqtt_message = (topic: string, message: any) => {
            errorMessage = `Unexpected publication: ${topic}`;
        };

        const request = {
            "message_type": "info_request",
            "message_schema_version": 3,
            "source": "",
            "request_id": "utc-test-003",
            "request_type": "utc_time",
            "payload": {},
        };

        anyNetworking.handle_mqtt_message_info_request_v3(request);

        expect(errorMessage).toBe("");
    });

    it("should reject V3 request with missing request_id", () => {
        const anyNetworking = networking as any;

        let errorMessage = "";
        anyNetworking.publish_mqtt_message = (topic: string, message: any) => {
            errorMessage = `Unexpected publication: ${topic}`;
        };

        const request = {
            "message_type": "info_request",
            "message_schema_version": 3,
            "source": "Test-Pico-1",
            "request_id": "",
            "request_type": "utc_time",
            "payload": {},
        };

        anyNetworking.handle_mqtt_message_info_request_v3(request);

        expect(errorMessage).toBe("");
    });

    it("should reject V3 request with non-empty payload", () => {
        const anyNetworking = networking as any;

        let errorMessage = "";
        anyNetworking.publish_mqtt_message = (topic: string, message: any) => {
            errorMessage = `Unexpected publication: ${topic}`;
        };

        const request = {
            "message_type": "info_request",
            "message_schema_version": 3,
            "source": "Test-Pico-1",
            "request_id": "utc-test-004",
            "request_type": "utc_time",
            "payload": { "unexpected": true },
        };

        anyNetworking.handle_mqtt_message_info_request_v3(request);

        expect(errorMessage).toBe("");
    });

    it("should reject V3 request with unknown request_type", () => {
        const anyNetworking = networking as any;

        let errorMessage = "";
        anyNetworking.publish_mqtt_message = (topic: string, message: any) => {
            errorMessage = `Unexpected publication: ${topic}`;
        };

        const request = {
            "message_type": "info_request",
            "message_schema_version": 3,
            "source": "Test-Pico-1",
            "request_id": "utc-test-005",
            "request_type": "unknown_type",
            "payload": {},
        };

        anyNetworking.handle_mqtt_message_info_request_v3(request);

        expect(errorMessage).toBe("");
    });

    it("should echo request_id correctly for multiple V3 requests", () => {
        const anyNetworking = networking as any;

        const publishedMessages: Array<{ topic: string; message: any }> = [];
        anyNetworking.publish_mqtt_message = (topic: string, message: any) => {
            publishedMessages.push({ topic, message });
        };

        // First request
        const request1 = {
            "message_type": "info_request",
            "message_schema_version": 3,
            "source": "Test-Pico-1",
            "request_id": "utc-hardware-001",
            "request_type": "utc_time",
            "payload": {},
        };
        anyNetworking.handle_mqtt_message_info_request_v3(request1);

        // Second request
        const request2 = {
            "message_type": "info_request",
            "message_schema_version": 3,
            "source": "Test-Pico-1",
            "request_id": "utc-hardware-002",
            "request_type": "utc_time",
            "payload": {},
        };
        anyNetworking.handle_mqtt_message_info_request_v3(request2);

        // Verify two responses
        expect(publishedMessages.length).toBe(2);

        // First response should echo utc-hardware-001
        expect(publishedMessages[0].message["request_id"]).toBe("utc-hardware-001");

        // Second response should echo utc-hardware-002
        expect(publishedMessages[1].message["request_id"]).toBe("utc-hardware-002");
    });
});
