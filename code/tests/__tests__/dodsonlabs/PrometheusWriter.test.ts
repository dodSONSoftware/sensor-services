/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import { register } from "prom-client";
import { PrometheusWriter } from "../../../src/dodsonlabs/PrometheusWriter";
import { LogLevel } from "../../../src/dodsonlabs/Interfaces";

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

describe("PrometheusWriter Number.isFinite guards", () => {
    let port: number;
    let writer: PrometheusWriter;
    let logger: TestLogger;

    beforeAll(async () => {
        port = await findFreePort();
        logger = createTestLogger();

        const config = {
            "mqtt-broker-ip-address": "127.0.0.1",
            "mqtt-topic-telemetry": "iot/telemetry",
            "mqtt-topic-command": "iot/v2/command",
            "mqtt-topic-command-response": "iot/v2/command-response",
            "prometheus-port": port,
            "ip-pinger-web-api": "http://127.0.0.1:3300",
            "case-sensitive": true,
        } as any;

        writer = new PrometheusWriter(config, logger);
    }, 10000);

    afterAll(() => {
        writer.close();
    });

    beforeEach(() => {
        // Clear all metrics between tests
        register.clear();
        jest.clearAllMocks();
    });

    // ---- publish_light

    it("should reject NaN uv_index in publish_light", () => {
        (writer as any).publish_light({
            light: { "uv_index": "not-a-number", lux: 500 },
        }, "sensor-1");

        expect(logger.write_warn).toHaveBeenCalledWith(
            expect.stringContaining("publish_light"),
            expect.stringContaining("invalid uv_index")
        );
    });

    it("should reject NaN lux in publish_light", () => {
        (writer as any).publish_light({
            light: { "uv_index": 5, lux: "not-a-number" },
        }, "sensor-1");

        expect(logger.write_warn).toHaveBeenCalledWith(
            expect.stringContaining("publish_light"),
            expect.stringContaining("invalid lux")
        );
    });

    it("should accept valid uv_index and lux in publish_light", () => {
        (writer as any).publish_light({
            light: { "uv_index": 5.2, lux: 1000 },
        }, "sensor-1");

        expect(logger.write_warn).not.toHaveBeenCalled();
    });

    // ---- publish_rain

    it("should reject NaN in_h2o in publish_rain", () => {
        (writer as any).publish_rain({
            rain: { "in_h2o": "not-a-number" },
        }, "sensor-1");

        expect(logger.write_warn).toHaveBeenCalledWith(
            expect.stringContaining("publish_rain"),
            expect.stringContaining("invalid in_h2o")
        );
    });

    it("should accept valid in_h2o in publish_rain", () => {
        (writer as any).publish_rain({
            rain: { "in_h2o": 0.5 },
        }, "sensor-1");

        expect(logger.write_warn).not.toHaveBeenCalled();
    });

    // ---- publish_wind

    it("should reject NaN wind_speed_cm_sec in publish_wind", () => {
        (writer as any).publish_wind({
            wind: { "wind_speed_cm_sec": "not-a-number", "gusts_cm_sec": 100 },
        }, "sensor-1");

        expect(logger.write_warn).toHaveBeenCalledWith(
            expect.stringContaining("publish_wind"),
            expect.stringContaining("invalid wind_speed_cm_sec")
        );
    });

    it("should reject NaN gusts_cm_sec in publish_wind", () => {
        (writer as any).publish_wind({
            wind: { "wind_speed_cm_sec": 100, "gusts_cm_sec": "not-a-number" },
        }, "sensor-1");

        expect(logger.write_warn).toHaveBeenCalledWith(
            expect.stringContaining("publish_wind"),
            expect.stringContaining("invalid gusts_cm_sec")
        );
    });

    it("should accept valid wind speed and gusts in publish_wind", () => {
        (writer as any).publish_wind({
            wind: { "wind_speed_cm_sec": 500, "gusts_cm_sec": 800 },
        }, "sensor-1");

        expect(logger.write_warn).not.toHaveBeenCalled();
    });

    // ---- publish_lightning

    it("should reject NaN lightning_count in publish_lightning", () => {
        (writer as any).publish_lightning({
            lightning: { "lightning_count": "not-a-number" },
        }, "sensor-1");

        expect(logger.write_warn).toHaveBeenCalledWith(
            expect.stringContaining("publish_lightning"),
            expect.stringContaining("invalid lightning_count")
        );
    });

    it("should accept valid lightning_count in publish_lightning", () => {
        (writer as any).publish_lightning({
            lightning: { "lightning_count": 3 },
        }, "sensor-1");

        expect(logger.write_warn).not.toHaveBeenCalled();
    });

    // ---- Infinity edge cases

    it("should reject Infinity values in publish_light", () => {
        (writer as any).publish_light({
            light: { "uv_index": Infinity, lux: -Infinity },
        }, "sensor-1");

        expect(logger.write_warn).toHaveBeenCalledTimes(2);
        expect(logger.write_warn).toHaveBeenCalledWith(
            expect.stringContaining("publish_light"),
            expect.stringContaining("invalid uv_index")
        );
        expect(logger.write_warn).toHaveBeenCalledWith(
            expect.stringContaining("publish_light"),
            expect.stringContaining("invalid lux")
        );
    });

    it("should reject Infinity values in publish_wind", () => {
        (writer as any).publish_wind({
            wind: { "wind_speed_cm_sec": Infinity, "gusts_cm_sec": Infinity },
        }, "sensor-1");

        expect(logger.write_warn).toHaveBeenCalledTimes(2);
        expect(logger.write_warn).toHaveBeenCalledWith(
            expect.stringContaining("publish_wind"),
            expect.stringContaining("invalid wind_speed_cm_sec")
        );
        expect(logger.write_warn).toHaveBeenCalledWith(
            expect.stringContaining("publish_wind"),
            expect.stringContaining("invalid gusts_cm_sec")
        );
    });

    // ---- physical temperature bounds

    it("should reject out-of-range air temperature in publish_air", () => {
        (writer as any).publish_air({
            air: { "temperature_c": -300, "humidity_percent": 50, "pressure_pascal": 101325 },
        }, "sensor-1");

        expect(logger.write_warn).toHaveBeenCalledWith(
            expect.stringContaining("publish_air"),
            expect.stringContaining("out of physical range")
        );
    });

    it("should reject out-of-range water temperature in publish_water", () => {
        (writer as any).publish_water({
            water: { "temperature_c": 300 },
        }, "sensor-1");

        expect(logger.write_warn).toHaveBeenCalledWith(
            expect.stringContaining("publish_water"),
            expect.stringContaining("out of physical range")
        );
    });

    it("should accept valid air temperature in publish_air", () => {
        (writer as any).publish_air({
            air: { "temperature_c": 20, "humidity_percent": 50, "pressure_pascal": 101325 },
        }, "sensor-1");

        expect(logger.write_warn).not.toHaveBeenCalled();
    });

    it("should accept valid water temperature in publish_water", () => {
        (writer as any).publish_water({
            water: { "temperature_c": 15 },
        }, "sensor-1");

        expect(logger.write_warn).not.toHaveBeenCalled();
    });
});

describe("sanitizeSource", () => {
    let port: number;
    let writer: PrometheusWriter;
    let logger: TestLogger;

    beforeAll(async () => {
        port = await findFreePort();
        logger = createTestLogger();

        const config = {
            "mqtt-broker-ip-address": "127.0.0.1",
            "mqtt-topic-telemetry": "iot/telemetry",
            "mqtt-topic-command": "iot/v2/command",
            "mqtt-topic-command-response": "iot/v2/command-response",
            "prometheus-port": port,
            "ip-pinger-web-api": "http://127.0.0.1:3300",
            "case-sensitive": true,
            "sensor-source-max-length": 30,
            "sensor-source-valid-chars-regex": "a-zA-Z0-9._-",
        } as any;

        writer = new PrometheusWriter(config, logger);
    }, 10000);

    afterAll(() => {
        writer.close();
    });

    beforeEach(() => {
        register.clear();
        jest.clearAllMocks();
    });

    it("should preserve hyphens in source names", () => {
        (writer as any).publish_air({
            air: { "temperature_c": 72, "humidity_percent": 50, "pressure_pascal": 101325 },
        }, "Air-1");

        expect(logger.write_warn).not.toHaveBeenCalled();
    });

    it("should strip spaces from source names", () => {
        (writer as any).publish_rain({
            rain: { "in_h2o": 0.5 },
        }, "Rain Gauge");

        expect(logger.write_warn).not.toHaveBeenCalled();
    });

    it("should preserve hyphens in water source names", () => {
        (writer as any).publish_water({
            water: { "temperature_c": 15 },
        }, "Water-1");

        expect(logger.write_warn).not.toHaveBeenCalled();
    });

    it("should return 'unknown' for empty source", () => {
        (writer as any).publish_air({
            air: { "temperature_c": 72, "humidity_percent": 50, "pressure_pascal": 101325 },
        }, "");

        expect(logger.write_warn).not.toHaveBeenCalled();
    });

    it("should strip slashes from source names", () => {
        (writer as any).publish_light({
            light: { "uv_index": 5, "lux": 1000 },
        }, "sensor/01");

        expect(logger.write_warn).not.toHaveBeenCalled();
    });
});
