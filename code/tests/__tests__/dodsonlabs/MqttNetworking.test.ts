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

// Fixtures captured verbatim from the live broker (sensors_v4.json, iot/v3/command-response)
const CAPTURED_GET_DETAILS_RESPONSE = {
    "uptime_ms": 73056,
    "message_type": "command_response",
    "payload": {
        "command_id": "00000001-7fd7cb1680a502782425a5415e5",
        "targeted": false,
        "command": "get-details",
        "success": true,
        "data": {
            "network": {
                "rssi": -36,
                "dns": "10.10.10.2",
                "ssid": "reniot77",
                "ip_address": "10.10.10.214",
                "netmask": "255.255.255.0",
                "gateway": "10.10.10.1"
            },
            "memory": {
                "heap_total_bytes": 205440,
                "heap_alloc_bytes": 137792,
                "heap_free_bytes": 67648
            },
            "runtime": {
                "read_loop_sec": 20,
                "start_time": "2026-09-27T06:43:09Z"
            },
            "cpu": {
                "frequency_hz": 125000000,
                "temperature_c": 29
            },
            "machine": {
                "machine": "Raspberry Pi Pico W with RP2040",
                "implementation": "micropython",
                "reset_cause": "wdt",
                "hardware_type": "pico_w",
                "firmware_name": "Bronze Owl",
                "version": "v1.28.0 on 2026-04-06 (GNU 14.2.0 MinSizeRel)"
            },
            "devices": {
                "active": 1,
                "configured": 1,
                "initialization_failed": 0
            },
            "communications": {
                "wifi_connected": true,
                "wifi_disconnect_count": 0,
                "mqtt_disconnect_count": 0,
                "wifi_connect_count": 1,
                "mqtt_connected": true,
                "mqtt_last_disconnect_reason": null,
                "mqtt_connect_count": 1
            },
            "device_status": [
                {
                    "successful_read_count": 3,
                    "device": "yl69_fc28",
                    "last_successful_read_age_ms": 16275,
                    "id": "7c7b334a85bc5a8b4d7137365306f2a0",
                    "initialization_attempts_used": 1,
                    "state": "ready",
                    "name": "YL-69/FC-28 Soil Moisture Sensor",
                    "consecutive_read_failures": 0,
                    "last_read_age_ms": 16296,
                    "total_read_failures": 0,
                    "read_count": 3
                }
            ]
        }
    },
    "timestamp": "2026-09-27T06:44:22Z",
    "sequence": 5,
    "message_schema_version": 3,
    "firmware_version": "0.4.158",
    "runtime_id": "runtime_e6614c311b9f5a3691b90d62",
    "source": "Soil-1"
};

const CAPTURED_READ_CONFIG_RESPONSE = {
    "uptime_ms": 51764779,
    "message_type": "command_response",
    "payload": {
        "command_id": "00000003-7fd7cb1680a502782425a5415e5",
        "targeted": false,
        "command": "read-config",
        "success": true,
        "data": {
            "reboot_required": false,
            "config": {
                "source": "Air-3",
                "config_schema_version": 10,
                "read_loop_sec": 20,
                "health_interval_sec": 60,
                "mqtt_broker_ip_address": "10.10.10.64",
                "mqtt_topic_command": "iot/v3/command",
                "mqtt_topic_command_response": "iot/v3/command-response",
                "mqtt_topic_telemetry": "iot/v3/telemetry",
                "mqtt_topic_log": "iot/v3/log",
                "mqtt_topic_info_request": "iot/v3/info-request",
                "mqtt_topic_info_response": "iot/v3/info-response",
                "mqtt_topic_health": "iot/v3/health",
                "mqtt_topic_network_probe": "iot/v3/network_probe",
                "devices": [
                    {
                        "id": "b2fba0cb9d95921febd0ffecf9c81406",
                        "config": {
                            "repeatability": "high",
                            "i2c_address_candidates": [68, 69],
                            "i2c_bus": 0,
                            "offsets": {
                                "humidity_percent": 0,
                                "temperature_c": 0
                            },
                            "i2c_sda_pin": 0,
                            "i2c_scl_pin": 1
                        },
                        "device_type": "sht35",
                        "name": "SHT35 Temperature/Humidity Sensor"
                    }
                ]
            }
        }
    },
    "timestamp": "2026-09-27T21:05:54Z",
    "sequence": 3452,
    "message_schema_version": 3,
    "firmware_version": "0.4.152",
    "runtime_id": "runtime_674f03e8c341bedbde16f824",
    "source": "Air-3"
};

const CAPTURED_REBOOT_RESPONSE = {
    "uptime_ms": 51771781,
    "message_type": "command_response",
    "payload": {
        "command_id": "00000004-7fd7cb1680a502782425a5415e5",
        "targeted": false,
        "command": "reboot",
        "success": true,
        "data": {
            "rebooting": true
        }
    },
    "timestamp": "2026-09-27T21:06:01Z",
    "sequence": 3453,
    "message_schema_version": 3,
    "firmware_version": "0.4.152",
    "runtime_id": "runtime_674f03e8c341bedbde16f824",
    "source": "Air-3"
};

describe("MqttNetworking", () => {
    let networking: MqttNetworking;
    let logger: TestLogger;

    // Real mqtt clients constructed by the MqttNetworking instances in this
    // suite. A test that swaps networking.mqtt_client for a mock (the P3-1
    // close tests) orphans its real client; without force-closing it here,
    // its reconnect timer fires into jest teardown (non-hermetic stderr
    // noise). end(true) is what actually clears the reconnect timer.
    const realClients: Array<{ end: (force: boolean, cb: () => void) => void }> = [];

    beforeEach(() => {
        logger = createTestLogger();

        // Build a minimal config
        const config = {
            "mqtt-broker-ip-address": "127.0.0.1",
            "mqtt-topic-command": "iot/v3/command",
            "mqtt-topic-command-response": "iot/v3/command-response",
            "ip-pinger-web-api": "http://127.0.0.1:32001",
            "case-sensitive": true,
        } as any;

        // MqttNetworking will try to connect to MQTT; that's fine — we only test the non-networking parts.
        networking = new MqttNetworking(config, logger);
        const realClient = (networking as any).mqtt_client;
        if (realClient) {
            realClients.push(realClient);
        }
    });

    afterEach(() => {
        // Best-effort cleanup — won't succeed without a real broker, but avoids leaks.
        networking.close(1000).catch(() => {});
        // Force-close any real client a test orphaned by swapping in a mock
        // (a second end() on an already-closed client is a no-op).
        for (const client of realClients.splice(0)) {
            try {
                client.end(true, () => { });
            } catch {
                /* best-effort */
            }
        }
    });

    it("should default the log topic to iot/v3/log", () => {
        const anyNetworking = networking as any;
        expect(anyNetworking.mqtt_topic_log).toBe("iot/v3/log");
    });

    // ---- outbound publish secret redaction (P1-3)

    describe("outbound publish secret redaction (P1-3)", () => {
        const WIFI_SECRET = "TEST_WIFI_SECRET";
        const PASSWORD_SECRET = "TEST_PASSWORD_SECRET";
        const DB_SECRET = "TEST_DB_SECRET";

        function writeConfigMessage() {
            return {
                "message_type": "command",
                "message_schema_version": 3,
                "target": "soil-1",
                "command": "write-config",
                "command_id": "cmd-123",
                "payload": {
                    "config": {
                        "source": "soil-1",
                        "wifi-password": WIFI_SECRET,
                        "password": PASSWORD_SECRET,
                        "db-password": DB_SECRET,
                        "some_normal_field": "visible-value",
                    },
                },
            };
        }

        // Replace the (disconnected) real client with a capture stub so we can
        // assert exactly what would be published, without any real broker.
        function installCaptureClient() {
            const publish = jest.fn();
            // mqtt client end() is called as end() / end(callback) for graceful
            // close and end(true, callback) for the forced-close timeout path
            (networking as any).mqtt_client = {
                publish,
                // mqtt.js end() is overloaded (end(cb) / end(true, cb)); fire
                // whichever callback form arrives so close() settles promptly.
                end: jest.fn((...args: unknown[]) => {
                    const cb = args.find((a) => typeof a === "function") as (() => void) | undefined;
                    cb?.();
                }),
            };
            return publish;
        }

        function allLoggedStrings() {
            return [
                (logger.write_debug as jest.Mock).mock.calls,
                (logger.write_info as jest.Mock).mock.calls,
                (logger.write_warn as jest.Mock).mock.calls,
                (logger.write_error as jest.Mock).mock.calls,
            ].flat().map((c) => String(c[1]));
        }

        it("publishes the original write-config payload intact (never mutated by redaction)", () => {
            const publish = installCaptureClient();
            const message = writeConfigMessage();

            networking.publish_mqtt_message("iot/v3/command", message);

            expect(publish).toHaveBeenCalledTimes(1);
            const [topic, raw] = publish.mock.calls[0];
            expect(topic).toBe("iot/v3/command");
            const published = JSON.parse(raw);
            // Original secrets are still present in what is actually published
            expect(published.payload.config["wifi-password"]).toBe(WIFI_SECRET);
            expect(published.payload.config["password"]).toBe(PASSWORD_SECRET);
            expect(published.payload.config["db-password"]).toBe(DB_SECRET);
        });

        it("logs no write-config secret and no config object — only operational metadata", () => {
            installCaptureClient();
            const message = writeConfigMessage();

            networking.publish_mqtt_message("iot/v3/command", message);

            const logged = allLoggedStrings();
            const serialized = JSON.stringify(logged);
            // No secret value reaches any logger
            expect(serialized).not.toContain(WIFI_SECRET);
            expect(serialized).not.toContain(PASSWORD_SECRET);
            expect(serialized).not.toContain(DB_SECRET);
            // The configuration object itself is excluded (not just the secrets)
            expect(serialized).not.toContain("some_normal_field");
            // Non-sensitive operational metadata remains available in the log
            const publishLog = logged.find((s) => s.includes("write-config"));
            expect(publishLog).toBeDefined();
            expect(publishLog!).toContain("cmd-123");
            expect(publishLog!).toContain("soil-1");
        });

        it("redacts sensitive keys on non-write-config commands (shared redaction) without mutating the original", () => {
            const publish = installCaptureClient();
            const message = {
                "message_type": "command",
                "message_schema_version": 3,
                "target": "*",
                "command": "read-config",
                "command_id": "cmd-456",
                "payload": {
                    "config": {
                        "password": PASSWORD_SECRET,
                        "nested": { "wifi-password": WIFI_SECRET },
                        "ok": "present",
                    },
                },
            };

            networking.publish_mqtt_message("iot/v3/command", message);

            // Original untouched
            expect(JSON.parse(publish.mock.calls[0][1]).payload.config.password).toBe(PASSWORD_SECRET);
            // Log has secrets masked, non-secret preserved
            const logged = allLoggedStrings().join("\n");
            expect(logged).not.toContain(PASSWORD_SECRET);
            expect(logged).not.toContain(WIFI_SECRET);
            expect(logged).toContain("********");
            expect(logged).toContain("present");
        });
    });

    // P3-1: the close timeout must be cleared when the graceful close wins the
    // race — otherwise the pending setTimeout outlives the close, forcing a
    // second (forced) disconnect and a spurious "timed out" error log after a
    // clean shutdown. Fake timers + a controllable end() make both outcomes
    // deterministic.
    describe("close() timeout handling (P3-1)", () => {
        // Restores a client whose end() settles immediately (both the
        // end(callback) and end(true, callback) forms), so the afterEach's
        // best-effort close() finishes without leaving a pending real timer.
        function installSafeClient() {
            (networking as any).mqtt_client = {
                publish: jest.fn(),
                end: jest.fn((...args: unknown[]) => {
                    const cb = args.find((a) => typeof a === "function") as (() => void) | undefined;
                    cb?.();
                }),
            };
        }

        // mqtt.js end() is overloaded: end(callback) for a graceful close and
        // end(true, callback) for a forced one. Distinguish by argument type —
        // a leading function is the graceful form.
        function makeEndMock(onGraceful: (cb: () => void) => void, onForced: (cb: () => void) => void) {
            return jest.fn((...args: unknown[]) => {
                if (typeof args[0] === "function") {
                    onGraceful(args[0] as () => void);
                } else {
                    onForced(args[1] as () => void);
                }
            });
        }

        it("graceful close wins -> no forced close, no spurious timeout error", async () => {
            jest.useFakeTimers();
            let forcedCount = 0;
            (networking as any).mqtt_client = {
                end: makeEndMock(
                    (cb) => cb(), // graceful end settles immediately -> wins the race
                    (cb) => { forcedCount++; cb(); }
                ),
            };
            try {
                await networking.close(1000);

                // Advance well past the timeout — the timer must have been
                // cleared, so no forced disconnect and no timeout error.
                jest.advanceTimersByTime(10_000);
                await Promise.resolve();

                expect(forcedCount).toBe(0);
                const timeoutLogs = (logger.write_error as jest.Mock).mock.calls.filter(
                    (c) => String(c[1]).includes("timed out")
                );
                expect(timeoutLogs).toHaveLength(0);
            } finally {
                jest.useRealTimers();
                installSafeClient();
            }
        });

        it("timeout wins -> forced close and timeout error are logged", async () => {
            jest.useFakeTimers();
            let forcedCount = 0;
            (networking as any).mqtt_client = {
                end: makeEndMock(
                    () => { /* graceful end: hold the callback so the timeout wins */ },
                    (cb) => { forcedCount++; cb(); }
                ),
            };
            try {
                const closePromise = networking.close(1000);
                jest.advanceTimersByTime(1000); // fire the close timeout
                await closePromise;
                await Promise.resolve();

                expect(forcedCount).toBe(1);
                const timeoutLogs = (logger.write_error as jest.Mock).mock.calls.filter(
                    (c) => String(c[1]).includes("timed out")
                );
                expect(timeoutLogs).toHaveLength(1);
            } finally {
                jest.useRealTimers();
                installSafeClient();
            }
        });
    });

    // ---- heat index (calculateHeatIndex)

    // Table-driven reference values. Expected outputs are derived from the
    // published NOAA/NWS Rothfusz regression (9-term fit valid at T >= 80°F)
    // with the documented low-humidity (RH < 13%, 80°F <= T <= 112°F) and
    // high-humidity (RH > 85%, T <= 87°F) corrections — NOT from the
    // implementation. Anchor: the NWS-published example 90°F / 70% RH ->
    // 106°F (41°C).
    describe("calculateHeatIndex (Rothfusz regression)", () => {
        // Explicit absolute tolerance (°C) for floating-point comparison
        const TOL_C = 0.01;

        const closeTo = (actual: number | undefined, expected: number, tolerance: number = TOL_C) => {
            expect(typeof actual).toBe("number");
            expect(Math.abs(actual! - expected)).toBeLessThan(tolerance);
        };

        it("should return the air temperature below the applicability threshold", () => {
            // 18°C (64.4°F) < 20°C threshold
            expect(networking.calculateHeatIndex(18, 80)).toBe(18);
        });

        it("should use the preliminary approximation in the 68–80°F band", () => {
            // 24°C (75.2°F), 70% RH — below the regression's 80°F applicability
            // range, the accepted preliminary formula applies:
            // HI = 0.5 * (T + 61 + (T-68) * 1.2 + RH * 0.094)
            closeTo(networking.calculateHeatIndex(24, 70), 24.2833);
        });

        it("should match the Rothfusz regression at 90°F / 40% RH", () => {
            // 32.2222°C = 90°F, 40% RH -> 90.6797°F = 32.5998°C
            closeTo(networking.calculateHeatIndex(32.2222, 40), 32.5998);
        });

        it("should match the NWS-published example at 90°F / 70% RH", () => {
            // NWS reference: 90°F (32°C), 70% RH feels like 106°F (41°C).
            // Formula-exact value: 105.9220°F = 41.0678°C.
            closeTo(networking.calculateHeatIndex(32.2222, 70), 41.0678, 0.1);
        });

        it("should handle moderately hot / moderate humidity (105°F / 75% RH)", () => {
            // 40.5556°C = 105°F, 75% RH -> 176.1350°F = 80.0750°C
            closeTo(networking.calculateHeatIndex(40.5556, 75), 80.075);
        });

        it("should handle high temperature / high humidity (110°F / 90% RH)", () => {
            // 43.3333°C = 110°F, 90% RH -> 246.9977°F = 119.4432°C
            closeTo(networking.calculateHeatIndex(43.3333, 90), 119.4432);
        });

        it("should apply the low-humidity correction (RH < 13%, 80°F <= T <= 112°F)", () => {
            // 35°C = 95°F, 10% RH: regression 90.1996°F minus
            // ((13-10)/4) * sqrt((17-|95-95|)/17) = 0.75°F -> 89.4496°F = 31.9164°C
            const hi = networking.calculateHeatIndex(35, 10);
            closeTo(hi, 31.9164);
            // The correction must keep the value materially below the uncorrected
            // regression result at this humidity.
            expect(hi).toBeLessThan(32.1);
        });

        it("should apply the high-humidity correction (RH > 85%, T <= 87°F)", () => {
            // 29.4444°C = 85°F, 90% RH: regression plus
            // ((90-85)/10) * ((87-85)/5) = +0.2°F -> 101.7808°F = 38.7671°C
            closeTo(networking.calculateHeatIndex(29.4444, 90), 38.7671);
        });

        it("should not apply the high-humidity correction above 87°F", () => {
            // 90°F, 90% RH: T > 87°F, so no correction — plain regression
            // (121.9012°F = 49.9451°C); with the correction it would differ.
            closeTo(networking.calculateHeatIndex(32.2222, 90), 49.9451);
        });

        it("should return undefined for missing or non-finite inputs", () => {
            expect(networking.calculateHeatIndex(undefined, 50)).toBeUndefined();
            expect(networking.calculateHeatIndex(30, undefined)).toBeUndefined();
            expect(networking.calculateHeatIndex(NaN, 50)).toBeUndefined();
            expect(networking.calculateHeatIndex(30, Number.POSITIVE_INFINITY)).toBeUndefined();
        });
    });

    it("should disable offline QoS-0 queueing so commands cannot be delivered after the fact", () => {
        // mqtt.js queues QoS-0 publishes while disconnected and flushes them on
        // reconnect — a reboot/write-config issued during an outage must never
        // execute late. queueQoSZero: false drops them instead.
        const anyNetworking = networking as any;
        expect(anyNetworking.mqtt_client.options.queueQoSZero).toBe(false);
    });

    it("should use a configured mqtt-topic-log when provided", () => {
        const config = {
            "mqtt-broker-ip-address": "127.0.0.1",
            "mqtt-topic-command": "iot/v3/command",
            "mqtt-topic-command-response": "iot/v3/command-response",
            "mqtt-topic-log": "custom/log-topic",
            "ip-pinger-web-api": "http://127.0.0.1:32001",
            "case-sensitive": true,
        } as any;
        const withLogTopic = new MqttNetworking(config, logger);
        expect((withLogTopic as any).mqtt_topic_log).toBe("custom/log-topic");
        withLogTopic.close(1000).catch(() => {});
    });

    // ---- unknown command type rejection (cr_dude_dict never grows unbounded)

    it("should reject unknown command types in get_cr_dude", () => {
        const result = networking.get_cr_dude("unknown-type");

        expect(result).toBeNull();
        expect(logger.write_warn).toHaveBeenCalledWith(
            "networking",
            expect.stringContaining("Unknown command type 'unknown-type'")
        );

        // Known V3 command types should still work
        for (const known of ["get-details", "read-config", "write-config", "reboot"]) {
            expect(networking.get_cr_dude(known)).not.toBeNull();
        }
        // V2-era commands are gone
        for (const gone of ["identify", "update-config"]) {
            expect(networking.get_cr_dude(gone)).toBeNull();
        }
    });

    it("should not create cr_dude_dict entries for unknown command types", () => {
        const anyNetworking = networking as any;
        const dictBefore = { ...anyNetworking.cr_dude_dict };

        networking.get_cr_dude("bogus-command");

        const dictAfter = anyNetworking.cr_dude_dict;
        expect(dictAfter).toEqual(dictBefore); // no new entry created
    });

    // ---- on_message topic filter (broker is unauthenticated — any client on
    // it can publish to any topic, so untracked topics are treated as forged)

    describe("on_message topic filter", () => {
        it("should drop a forged command_response arriving on an untracked topic", async () => {
            const anyNetworking = networking as any;
            const dude = networking.get_cr_dude("get-details")!;
            dude.initialize();

            // The same payload that routes fine on the subscribed topic must be
            // ignored on a topic this client never subscribed to
            await anyNetworking.on_message(
                "iot/v3/telemetry",
                Buffer.from(JSON.stringify(CAPTURED_GET_DETAILS_RESPONSE)),
                {}
            );
            // on_message dispatches handle_mqtt_message asynchronously
            await new Promise((resolve) => setTimeout(resolve, 10));

            expect(dude.results).toHaveLength(0);
            expect(logger.write_warn).toHaveBeenCalledWith(
                "networking",
                expect.stringContaining("Dropping message on untracked topic")
            );
            dude.deinitialize();
        });

        it("should still route the same response on the subscribed command-response topic", async () => {
            const anyNetworking = networking as any;
            const dude = networking.get_cr_dude("get-details")!;
            dude.initialize(CAPTURED_GET_DETAILS_RESPONSE["payload"]["command_id"]);

            await anyNetworking.on_message(
                "iot/v3/command-response",
                Buffer.from(JSON.stringify(CAPTURED_GET_DETAILS_RESPONSE)),
                {}
            );
            await new Promise((resolve) => setTimeout(resolve, 10));

            expect(dude.results).toHaveLength(1);
            expect(dude.results[0].source).toBe("Soil-1");
            dude.deinitialize();
        });
    });

    // ---- V3 command-response handling (fixtures from the live capture)

    describe("V3 command_response handling", () => {
        it("should route a captured get-details response into the get-details control", async () => {
            const anyNetworking = networking as any;
            const dude = networking.get_cr_dude("get-details")!;
            dude.initialize(CAPTURED_GET_DETAILS_RESPONSE["payload"]["command_id"]);

            await anyNetworking.handle_mqtt_message(CAPTURED_GET_DETAILS_RESPONSE);

            expect(dude.results).toHaveLength(1);
            const result = dude.results[0];
            expect(result.source).toBe("Soil-1");
            expect(result.command_id).toBe("00000001-7fd7cb1680a502782425a5415e5");
            expect(result.targeted).toBe(false);
            expect(result.schema_version).toBe(3);
            expect(result.firmware_version).toBe("0.4.158");
            expect(result.uptime_ms).toBe(73056);
            expect(result.timestamp).toBe("2026-09-27T06:44:22Z");
            expect(result.sequence).toBe(5);
            expect(result.runtime_id).toBe("runtime_e6614c311b9f5a3691b90d62");
            // The firmware payload passes through verbatim, including data
            expect(result.payload).toEqual(CAPTURED_GET_DETAILS_RESPONSE["payload"]);
            expect(result.payload["success"]).toBe(true);
            expect((result.payload as any)["data"]["network"]["ip_address"]).toBe("10.10.10.214");

            dude.deinitialize();
        });

        // Optional-3: pin the numeric-normalization contract for `_ms` fields
        // explicitly. getNumericField() truncates to integer every field whose
        // name contains "time" or "millis" — "uptime_ms" matches via "upTIME",
        // so a fractional value is truncated here. This test pins that
        // contract for uptime_ms instead of leaving it implied by the library
        // docstring (which says "time-related fields (milliseconds)").
        it("truncates a fractional uptime_ms to an integer (Optional-3)", async () => {
            const anyNetworking = networking as any;
            const dude = networking.get_cr_dude("get-details")!;
            dude.initialize("opt3-0001");

            await anyNetworking.handle_mqtt_message({
                "uptime_ms": 73056.7,
                "message_type": "command_response",
                "message_schema_version": 3,
                "payload": {
                    "command": "get-details",
                    "command_id": "opt3-0001",
                    "success": true,
                    "data": {},
                },
                "source": "Soil-1",
            } as any);

            expect(dude.results).toHaveLength(1);
            expect(dude.results[0].uptime_ms).toBe(73056);

            dude.deinitialize();
        });

        it("should route a captured read-config response into the read-config control", async () => {
            const anyNetworking = networking as any;
            const dude = networking.get_cr_dude("read-config")!;
            dude.initialize(CAPTURED_READ_CONFIG_RESPONSE["payload"]["command_id"]);

            await anyNetworking.handle_mqtt_message(CAPTURED_READ_CONFIG_RESPONSE);

            expect(dude.results).toHaveLength(1);
            const result = dude.results[0];
            expect(result.source).toBe("Air-3");
            expect(result.command_id).toBe("00000003-7fd7cb1680a502782425a5415e5");
            expect(result.firmware_version).toBe("0.4.152");
            expect(result.schema_version).toBe(3);
            expect(result.sequence).toBe(3452);
            expect((result.payload as any)["data"]["reboot_required"]).toBe(false);
            expect((result.payload as any)["data"]["config"]["config_schema_version"]).toBe(10);

            dude.deinitialize();
        });

        it("should route a captured reboot response into the reboot control", async () => {
            const anyNetworking = networking as any;
            const dude = networking.get_cr_dude("reboot")!;
            dude.initialize(CAPTURED_REBOOT_RESPONSE["payload"]["command_id"]);

            await anyNetworking.handle_mqtt_message(CAPTURED_REBOOT_RESPONSE);

            expect(dude.results).toHaveLength(1);
            const result = dude.results[0];
            expect(result.source).toBe("Air-3");
            expect(result.command_id).toBe("00000004-7fd7cb1680a502782425a5415e5");
            expect(result.uptime_ms).toBe(51771781);
            expect((result.payload as any)["data"]).toEqual({ rebooting: true });

            dude.deinitialize();
        });

        it("should pass error responses through inside payload", async () => {
            const anyNetworking = networking as any;
            const dude = networking.get_cr_dude("get-details")!;
            dude.initialize("err-0001");

            const errorResponse = {
                "message_type": "command_response",
                "payload": {
                    "command_id": "err-0001",
                    "targeted": true,
                    "command": "get-details",
                    "success": false,
                    "error": { "code": "response_too_large", "message": "Response exceeded the outbound limit" }
                },
                "message_schema_version": 3,
                "firmware_version": "0.4.158",
                "source": "Soil-2"
            };
            await anyNetworking.handle_mqtt_message(errorResponse);

            expect(dude.results).toHaveLength(1);
            const result = dude.results[0];
            expect(result.source).toBe("Soil-2");
            expect(result.command_id).toBe("err-0001");
            expect(result.targeted).toBe(true);
            expect((result.payload as any)["success"]).toBe(false);
            expect((result.payload as any)["error"]["code"]).toBe("response_too_large");

            dude.deinitialize();
        });

        it("should drop command responses missing source", async () => {
            const anyNetworking = networking as any;
            const dude = networking.get_cr_dude("get-details")!;
            dude.initialize();

            const { source, ...withoutSource } = CAPTURED_GET_DETAILS_RESPONSE;
            await anyNetworking.handle_mqtt_message(withoutSource);

            expect(dude.results).toHaveLength(0);
            expect(logger.write_error).toHaveBeenCalledWith(
                "networking",
                expect.stringContaining("Missing 'source' key")
            );

            dude.deinitialize();
        });

        it("should drop command responses missing payload.command", async () => {
            const anyNetworking = networking as any;
            const dude = networking.get_cr_dude("get-details")!;
            dude.initialize();

            const doc = JSON.parse(JSON.stringify(CAPTURED_GET_DETAILS_RESPONSE));
            delete doc["payload"]["command"];
            await anyNetworking.handle_mqtt_message(doc);

            expect(dude.results).toHaveLength(0);
            expect(logger.write_error).toHaveBeenCalledWith(
                "networking",
                expect.stringContaining("Missing 'payload.command'")
            );

            dude.deinitialize();
        });

        it("should drop command responses with a non-object payload", async () => {
            const anyNetworking = networking as any;
            const dude = networking.get_cr_dude("get-details")!;
            dude.initialize();

            const doc = JSON.parse(JSON.stringify(CAPTURED_GET_DETAILS_RESPONSE));
            doc["payload"] = "not-an-object";
            await anyNetworking.handle_mqtt_message(doc);

            expect(dude.results).toHaveLength(0);

            dude.deinitialize();
        });

        it("should warn and drop hyphenated (V2-style) command-response messages", async () => {
            const anyNetworking = networking as any;
            const dude = networking.get_cr_dude("get-details")!;
            dude.initialize();

            const doc = JSON.parse(JSON.stringify(CAPTURED_GET_DETAILS_RESPONSE));
            doc["message_type"] = "command-response";
            await anyNetworking.handle_mqtt_message(doc);

            expect(dude.results).toHaveLength(0);
            expect(logger.write_warn).toHaveBeenCalledWith(
                "networking",
                expect.stringContaining("Unknown message_type 'command-response'")
            );

            dude.deinitialize();
        });

        it("should scrub passwords from the logged command response", async () => {
            const anyNetworking = networking as any;

            const doc = JSON.parse(JSON.stringify(CAPTURED_READ_CONFIG_RESPONSE));
            doc["payload"]["data"]["config"]["wifi-password"] = "hunter2";
            doc["payload"]["data"]["config"]["db-password"] = "hunter3";
            await anyNetworking.handle_mqtt_message(doc);

            // The handler logs a sanitized deep clone — assert the logger saw no secrets
            const writeDebugCalls = (logger.write_debug as jest.Mock).mock.calls;
            const serialized = JSON.stringify(writeDebugCalls);
            expect(serialized).not.toContain("hunter2");
            expect(serialized).not.toContain("hunter3");
        });
    });

    // ---- command_id correlation (stale-response race)

    describe("command_id correlation", () => {
        // Build a command_response with the given command_id and source
        function responseFor(commandId: string, source: string = "Air-1"): Record<string, any> {
            return {
                "message_type": "command_response",
                "payload": {
                    "command_id": commandId,
                    "targeted": false,
                    "command": "get-details",
                    "success": true,
                    "data": { "source": source },
                },
                "message_schema_version": 3,
                "source": source,
            };
        }

        it("should accept a late response only for the active command_id", async () => {
            const anyNetworking = networking as any;
            const dude = networking.get_cr_dude("get-details")!;

            // Request A: starts and completes
            dude.initialize("cmd-A");
            await anyNetworking.handle_mqtt_message(responseFor("cmd-A", "Air-1"));
            expect(dude.results).toHaveLength(1);
            dude.deinitialize();

            // Request B starts with a fresh command id
            dude.initialize("cmd-B");
            const timerBefore = dude.timeout;

            // Late response from request A arrives while B is active — it must
            // not enter B's result set or restart B's silence timer
            await anyNetworking.handle_mqtt_message(responseFor("cmd-A", "Air-1"));
            expect(dude.results).toHaveLength(0);
            expect(dude.is_timed_out).toBe(false);
            expect(dude.timeout).toBe(timerBefore);

            // A valid response for B arrives
            await anyNetworking.handle_mqtt_message(responseFor("cmd-B", "Air-1"));
            expect(dude.results).toHaveLength(1);
            expect(dude.results[0].command_id).toBe("cmd-B");

            dude.deinitialize();
        });

        it("should accept multiple responses from different sensors using the same active command_id", async () => {
            const anyNetworking = networking as any;
            const dude = networking.get_cr_dude("get-details")!;
            dude.initialize("cmd-B");

            // Multiple sensors answering one broadcast command is valid — all
            // responses carrying the active command_id must be retained
            await anyNetworking.handle_mqtt_message(responseFor("cmd-B", "Air-1"));
            await anyNetworking.handle_mqtt_message(responseFor("cmd-B", "Air-2"));
            await anyNetworking.handle_mqtt_message(responseFor("cmd-B", "Air-3"));

            expect(dude.results).toHaveLength(3);
            expect(dude.results.map(r => r.source)).toEqual(["Air-1", "Air-2", "Air-3"]);
            dude.results.forEach(r => expect(r.command_id).toBe("cmd-B"));

            dude.deinitialize();
        });

        it("should ignore a response when no command is active", async () => {
            const anyNetworking = networking as any;
            const dude = networking.get_cr_dude("get-details")!;

            expect(dude.is_running).toBe(false);

            await anyNetworking.handle_mqtt_message(responseFor("cmd-orphan"));

            expect(dude.results).toHaveLength(0);
            // No timer started or restarted
            expect(dude.is_timed_out).toBe(false);
            expect(dude.timeout).toBeNull();
        });

        it("should ignore a response carrying a different command_id during an active request", async () => {
            const anyNetworking = networking as any;
            const dude = networking.get_cr_dude("get-details")!;
            dude.initialize("cmd-B");
            const timerBefore = dude.timeout;

            await anyNetworking.handle_mqtt_message(responseFor("cmd-C", "Air-1"));

            expect(dude.results).toHaveLength(0);
            expect(dude.is_timed_out).toBe(false);
            expect(dude.timeout).toBe(timerBefore);

            dude.deinitialize();
        });

        it("should ignore a response with no command_id during an active request", async () => {
            const anyNetworking = networking as any;
            const dude = networking.get_cr_dude("get-details")!;
            dude.initialize("cmd-B");

            const doc = responseFor("cmd-B", "Air-1");
            delete doc["payload"]["command_id"];
            await anyNetworking.handle_mqtt_message(doc);

            expect(dude.results).toHaveLength(0);
            dude.deinitialize();
        });

        it("should also correlate reboot responses with the active command_id", async () => {
            const anyNetworking = networking as any;
            const dude = networking.get_cr_dude("reboot")!;
            dude.initialize("cmd-reboot-B");

            const rebootResponse = {
                "message_type": "command_response",
                "payload": {
                    "command_id": "cmd-reboot-A", // stale id from a previous reboot
                    "targeted": true,
                    "command": "reboot",
                    "success": true,
                    "data": { "rebooting": true },
                },
                "message_schema_version": 3,
                "source": "Air-1",
            };
            await anyNetworking.handle_mqtt_message(rebootResponse);
            expect(dude.results).toHaveLength(0);

            const validResponse = { ...rebootResponse, "payload": { ...rebootResponse["payload"], "command_id": "cmd-reboot-B" } };
            await anyNetworking.handle_mqtt_message(validResponse);
            expect(dude.results).toHaveLength(1);
            expect(dude.results[0].command_id).toBe("cmd-reboot-B");

            dude.deinitialize();
        });
    });

    // ---- V3 log message handling

    describe("V3 log message handling", () => {
        it("should forward V3 nested-payload logs at the mapped level", async () => {
            const anyNetworking = networking as any;

            // Captured shape from sensors_v4.json (iot/v3/log)
            const logMessage = {
                "message_type": "log",
                "payload": {
                    "message": "System startup completed",
                    "level": "info",
                    "event": "system_startup_completed",
                    "module": "system",
                    "data": {
                        "startup": {
                            "duration_ms": 14467,
                            "reset_cause": "wdt",
                            "devices_configured": 1,
                            "devices_ready": 1,
                            "devices_failed": 0
                        }
                    }
                },
                "timestamp": "2026-09-27T06:43:24Z",
                "sequence": 0,
                "message_schema_version": 3,
                "firmware_version": "0.4.152",
                "runtime_id": "runtime_aaa5809163040fcbbec7b7d6",
                "source": "Air-4"
            };

            await anyNetworking.handle_mqtt_message(logMessage);

            expect(logger.write_info).toHaveBeenCalledWith(
                "MqttNetworking::log",
                expect.stringContaining("[Air-4]")
            );
            const logged = (logger.write_info as jest.Mock).mock.calls
                .map(c => c[1])
                .find((line: string) => line.includes("Air-4"));
            expect(logged).toContain("event='system_startup_completed'");
            expect(logged).toContain("module='system'");
            expect(logged).toContain("System startup completed");
        });

        it("should respect the forward-sensor-logs level gate for nested levels", async () => {
            const config = {
                "mqtt-broker-ip-address": "127.0.0.1",
                "mqtt-topic-command": "iot/v3/command",
                "mqtt-topic-command-response": "iot/v3/command-response",
                "forward-sensor-logs": true,
                "forward-sensor-logs-level": "warn",
                "ip-pinger-web-api": "http://127.0.0.1:32001",
                "case-sensitive": true,
            } as any;
            const gated = new MqttNetworking(config, logger);

            const infoLog = {
                "message_type": "log",
                "payload": { "message": "an info message", "level": "info" },
                "source": "Air-4"
            };
            const errorLog = {
                "message_type": "log",
                "payload": { "message": "an error message", "level": "error" },
                "source": "Air-4"
            };

            await (gated as any).handle_mqtt_message(infoLog);
            await (gated as any).handle_mqtt_message(errorLog);

            // info is below the warn threshold — dropped
            const allCalls = [
                ...(logger.write_info as jest.Mock).mock.calls,
                ...(logger.write_warn as jest.Mock).mock.calls,
                ...(logger.write_error as jest.Mock).mock.calls,
            ].map(c => c[1]).join("\n");
            expect(allCalls).not.toContain("an info message");
            // error passes the gate
            expect(allCalls).toContain("an error message");
            expect((logger.write_error as jest.Mock).mock.calls
                .map(c => c[0])
                .filter(o => o === "MqttNetworking::log")).toHaveLength(1);

            gated.close(1000).catch(() => {});
        });

        it("should fall back to top-level level/message when payload is absent", async () => {
            const anyNetworking = networking as any;

            await anyNetworking.handle_mqtt_message({
                "message_type": "log",
                "level": "warn",
                "message": "legacy flat shape",
                "source": "Water-1"
            });

            expect(logger.write_warn).toHaveBeenCalledWith(
                "MqttNetworking::log",
                expect.stringContaining("legacy flat shape")
            );
        });
    });

    // ---- V3 UTC info-request tests

    it("should handle valid V3 utc_time request and publish response", () => {
        const anyNetworking = networking as any;

        // Mock the publish_mqtt_message to capture calls
        const publishedMessages: Array<{ topic: string; message: any }> = [];
        anyNetworking.publish_mqtt_message = (topic: string, message: any) => {
            publishedMessages.push({ topic, message });
            // Mirrors the real async publish_mqtt_message (always a Promise)
            return Promise.resolve();
        };

        // Valid V3 utc_time request (captured shape from sensors_v4.json, iot/v3/info-request)
        const request = {
            "request_id": "runtime_aaa5809163040fcbbec7b7d6_1",
            "message_schema_version": 3,
            "payload": {},
            "request_type": "utc_time",
            "source": "Air-4",
            "message_type": "info_request",
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
        expect(response["target"]).toBe("Air-4");
        expect(response["request_id"]).toBe("runtime_aaa5809163040fcbbec7b7d6_1");
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
            // Mirrors the real async publish_mqtt_message (always a Promise)
            return Promise.resolve();
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

    // P2-1: publish_mqtt_message must surface the ASYNCHRONOUS publish
    // failure. A QoS-0 publish made while disconnected is reported by mqtt.js
    // through the publish callback (not synchronously), so the old
    // fire-and-forget call discarded the failure; the promise wrapper makes it
    // observable to the caller.
    describe("publish_mqtt_message async completion (P2-1)", () => {
        function installPublishClient(publish: jest.Mock) {
            (networking as any).mqtt_client = {
                publish,
                // Settle close() (both end(cb) and end(true, cb) forms) so the
                // afterEach cleanup finishes without leaving a pending timer.
                end: jest.fn((...args: unknown[]) => {
                    const cb = args.find((a) => typeof a === "function") as (() => void) | undefined;
                    cb?.();
                }),
            };
        }

        it("rejects when the publish callback reports a failure", async () => {
            let publishCallback: ((err: Error | null) => void) | undefined;
            installPublishClient(
                jest.fn((_topic: string, _msg: string, cb: (err: Error | null) => void) => {
                    publishCallback = cb;
                })
            );

            const promise = networking.publish_mqtt_message("iot/v3/command", { a: 1 });
            // The failure arrives asynchronously, after publish() has returned.
            publishCallback!(new Error("No connection to broker"));

            await expect(promise).rejects.toThrow("No connection to broker");
        });

        it("resolves when the publish callback reports success", async () => {
            let publishCallback: ((err: Error | null) => void) | undefined;
            installPublishClient(
                jest.fn((_topic: string, _msg: string, cb: (err: Error | null) => void) => {
                    publishCallback = cb;
                })
            );

            const promise = networking.publish_mqtt_message("iot/v3/command", { a: 1 });
            // The connected QoS-0 path invokes cb() with no error once written.
            publishCallback!(null);

            await expect(promise).resolves.toBeUndefined();
        });
    });
});
