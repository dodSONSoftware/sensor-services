import { register } from "prom-client";
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

function findFreePort(): Promise<number> {
    return new Promise((resolve) => {
        const server = require("net").createServer((socket: any) => socket.end());
        server.listen(0, () => {
            const port = (server.address() as any).port;
            server.close(() => resolve(port));
        });
    });
}

describe("MqttNetworking command latency histogram", () => {
    let port: number;
    let networking: MqttNetworking;
    let logger: TestLogger;

    beforeAll(async () => {
        port = await findFreePort();
        logger = createTestLogger();

        // Build a minimal config with a random port so PrometheusWriter doesn't conflict
        const config = {
            "mqtt-broker-ip-address": "127.0.0.1",
            "mqtt-topic-telemetry": "iot/telemetry",
            "mqtt-topic-command": "iot/v2/command",
            "mqtt-topic-command-response": "iot/v2/command-response",
            "prometheus-port": port,
            "ip-pinger-web-api": "http://127.0.0.1:3300",
            "case-sensitive": true,
        } as any;

        // MqttNetworking will try to connect to MQTT; that's fine — we only test the histogram.
        networking = new MqttNetworking(config, logger);
    }, 10000);

    afterAll(() => {
        // Best-effort cleanup — won't succeed without a real broker, but avoids leaks.
        networking.close(1000).catch(() => {});
    });

    it("should create the mqtt_command_latency_seconds histogram in the prom-client registry", async () => {
        const metrics = await register.metrics();
        expect(metrics).toContain("mqtt_command_latency_seconds");
    });

    it("should record latency when a command is published and a response is received", () => {
        // Access the private map via `any` cast for testing
        const anyNetworking = networking as any;
        const publishTimes = anyNetworking.__command_publish_times;

        // Simulate publishing a command
        networking.publish_mqtt_message("iot/v2/command", {
            "message-type": "command",
            "command-id": "test-latency-1",
            "command": "identify",
        });

        expect(publishTimes.has("test-latency-1")).toBe(true);

        // Simulate the response arriving 50ms later
        jest.useFakeTimers();
        jest.advanceTimersByTime(50);

        // Access the private handler via `any` cast
        (networking as any).handle_mqtt_message_command_response({
            "type": "identify",
            "source": "sensor-1",
            "command-id": "test-latency-1",
            "payload": {},
        });

        expect(publishTimes.has("test-latency-1")).toBe(false); // evicted after recording

        jest.useRealTimers();
    });

    it("should label latency observations by command type", async () => {
        const anyNetworking = networking as any;

        // Publish a "reboot" command
        networking.publish_mqtt_message("iot/v2/command", {
            "message-type": "command",
            "command-id": "test-label-2",
            "command": "reboot",
        });

        // Simulate response after 200ms
        jest.useFakeTimers();
        jest.advanceTimersByTime(200);

        (networking as any).handle_mqtt_message_command_response({
            "type": "reboot",
            "source": "sensor-2",
            "command-id": "test-label-2",
            "payload": {},
        });

        jest.useRealTimers();

        // Verify the histogram exists and the metric output contains the reboot label
        const histogram = anyNetworking.prometheus_command_latency_histogram;
        expect(histogram).toBeDefined();

        const metrics = await register.metrics();
        expect(metrics).toContain("mqtt_command_latency_seconds");
        expect(metrics).toContain('command="reboot"');
    });

    // ---- outbound command deduplication

    it("should skip publish when a duplicate command-id is sent", () => {
        const anyNetworking = networking as any;
        const seenIds = anyNetworking.seen_command_ids;
        const sizeBefore = seenIds.size;

        const msg = {
            "message-type": "command",
            "command-id": "dedup-test-1",
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
            "message-type": "command",
            "command-id": "dedup-test-2a",
            "command": "identify",
        });
        networking.publish_mqtt_message("iot/v2/command", {
            "message-type": "command",
            "command-id": "dedup-test-2b",
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
            "message-type": "command",
            "command": "identify",
        });
        networking.publish_mqtt_message("iot/v2/command", {
            "message-type": "command",
            "command": "identify",
        });

        // No command-id means no registration — size unchanged
        expect(seenIds.size).toBe(sizeBefore);
    });
});
