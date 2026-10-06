/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import type express from "express";
import { setConfig } from "../../../src/common/global";

// Fixtures
const LOKI_RESPONSE = {
    data: {
        resultType: "streams",
        result: [
            {
                stream: { service_name: "sensor-telemetry" },
                values: [
                    ["1700000000000000000", JSON.stringify({ level: "info", message: "hello from the sensor" })],
                ],
            },
        ],
    },
};

function makeApp(): express.Application {
    const express = require("express");
    const app = express();
    app.use(express.json());
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { CreateLogRoutes } = require("../../../src/routes/logRoutes");
    const logRoutes = new CreateLogRoutes(app);
    logRoutes.register();
    return app;
}

describe("logController (GET /sensors/logs/:source)", () => {
    let app: express.Application;
    let fetchMock: jest.Mock;
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
        app = makeApp();
        // Loki configured and enabled
        setConfig({
            "loki-url": "http://loki.test:3100",
            "loki-enabled": true,
        } as any);
        fetchMock = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => LOKI_RESPONSE,
        });
        (globalThis as any).fetch = fetchMock;
    });

    afterEach(() => {
        (globalThis as any).fetch = originalFetch;
        setConfig(undefined as any);
    });

    // ---- LogQL injection guard: source is interpolated into the query, so it
    // must match a strict allowlist

    it("should return 400 for a source containing a LogQL string-literal breakout", async () => {
        const request = require("supertest");
        // evil" — attempts to close the |source="..." literal
        const res = await request(app).get("/sensors/logs/evil%22");
        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty("error", "invalid sensor source");
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("should return 400 for a source containing a LogQL pipe", async () => {
        const request = require("supertest");
        // |line_format="pwned" would append a new LogQL stage
        const res = await request(app).get("/sensors/logs/evil|line_format%3D%22pwned%22");
        expect(res.status).toBe(400);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("should return 400 for a source over 64 characters", async () => {
        const request = require("supertest");
        const longSource = "a".repeat(65);
        const res = await request(app).get(`/sensors/logs/${longSource}`);
        expect(res.status).toBe(400);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("should accept the special ip-pinger source (it is in the allowed character set)", async () => {
        const request = require("supertest");
        const res = await request(app).get("/sensors/logs/ip-pinger");
        expect(res.status).toBe(200);
        // ip-pinger has no per-source label — the query uses its service label only
        const url = decodeURIComponent(fetchMock.mock.calls[0][0] as string);
        expect(url).toContain('service_name="ip-pinger"');
        expect(url).not.toContain("|source=");
    });

    // ---- level allowlist

    it("should return 400 when every requested level is unknown", async () => {
        const request = require("supertest");
        const res = await request(app).get("/sensors/logs/Air-1?level=bogus");
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/invalid log level/);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("should drop unknown levels and keep the valid ones", async () => {
        const request = require("supertest");
        const res = await request(app)
            .get("/sensors/logs/Air-1?level=info&level=bogus&level=warn");
        expect(res.status).toBe(200);
        const url = decodeURIComponent(fetchMock.mock.calls[0][0] as string);
        expect(url).toContain("|level=~\"^(info|warn)$\"");
    });

    // ---- valid request: LogQL shape + timeout wiring

    it("should build the expected LogQL query and pass an AbortSignal to fetch", async () => {
        const request = require("supertest");
        const res = await request(app).get("/sensors/logs/Air-1?level=info");
        expect(res.status).toBe(200);

        const [url, options] = fetchMock.mock.calls[0] as [string, { signal?: unknown }];
        const decoded = decodeURIComponent(url);
        // source is quoted inside a LogQL string literal
        expect(decoded).toContain('|source="Air-1"');
        expect(decoded).toContain("|level=~\"^(info)$\"");
        // a hung Loki must not hang the handler — the fetch must carry a signal
        expect(options.signal).toBeInstanceOf(AbortSignal);

        // log entries are parsed out of the Loki stream values
        expect(res.body).toEqual([
            {
                timestamp: new Date(1_700_000_000_000).toISOString(),
                level: "info",
                message: "hello from the sensor",
            },
        ]);
    });

    it("should default to all four levels when no level is requested", async () => {
        const request = require("supertest");
        const res = await request(app).get("/sensors/logs/Air-1");
        expect(res.status).toBe(200);
        const url = decodeURIComponent(fetchMock.mock.calls[0][0] as string);
        expect(url).toContain("|level=~\"^(debug|info|warn|error)$\"");
    });

    // ---- limit and end-time handling (Optional-5)

    function urlParams(url: string): Record<string, string> {
        const out: Record<string, string> = {};
        new URL(url).searchParams.forEach((v, k) => { out[k] = v; });
        return out;
    }

    it("should use the default limit (50) when no limit param is given", async () => {
        const request = require("supertest");
        await request(app).get("/sensors/logs/Air-1");
        const params = urlParams(fetchMock.mock.calls[0][0] as string);
        expect(params.limit).toBe("50");
    });

    it("should clamp limit to the maximum of 100", async () => {
        const request = require("supertest");
        await request(app).get("/sensors/logs/Air-1?limit=500");
        const params = urlParams(fetchMock.mock.calls[0][0] as string);
        expect(params.limit).toBe("100");
    });

    it("should fall back to the default limit for invalid values", async () => {
        const request = require("supertest");
        for (const bad of ["0", "-5", "abc"]) {
            fetchMock.mockClear();
            await request(app).get(`/sensors/logs/Air-1?limit=${bad}`);
            const params = urlParams(fetchMock.mock.calls[0][0] as string);
            expect(params.limit).toBe("50");
        }
    });

    it("should slice the returned entries to the requested limit", async () => {
        // Truncation is defensive (Loki's query_range limit parameter caps
        // the total number of log entries) and must run AFTER the global
        // newest-first sort, so the surviving entries are the newest ones —
        // here entry 4 and entry 3, even though the fixture lists them
        // oldest-first.
        const values = Array.from({ length: 5 }, (_, i) => [
            String((1_700_000_000_000 + i * 1_000_000) * 1_000_000),
            JSON.stringify({ level: "info", message: `entry ${i}` }),
        ]);
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ data: { resultType: "streams", result: [{ stream: {}, values }] } }),
        });
        const request = require("supertest");
        const res = await request(app).get("/sensors/logs/Air-1?limit=2");
        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(2);
        expect(res.body.map((e: { message: string }) => e.message)).toEqual(["entry 4", "entry 3"]);
    });

    // P2-2: Loki entries within a stream are timestamp-ordered, but entries
    // ACROSS streams are not — the controller must sort the flattened result
    // globally, newest-first (dir=backward), before truncating.

    const MULTI_STREAM_RESPONSE = {
        data: {
            resultType: "streams",
            result: [
                {
                    stream: { source: "A" },
                    values: [
                        ["1791277205000000000", "A5"],
                        ["1791277201000000000", "A1"],
                    ],
                },
                {
                    stream: { source: "B" },
                    values: [
                        ["1791277204000000000", "B4"],
                        ["1791277203000000000", "B3"],
                    ],
                },
            ],
        },
    };

    it("P2-2: globally orders interleaved multi-stream results newest-first", async () => {
        fetchMock.mockResolvedValueOnce({ ok: true, json: async () => MULTI_STREAM_RESPONSE });
        const request = require("supertest");
        const res = await request(app).get("/sensors/logs/Air-1");
        expect(res.status).toBe(200);
        // Naive stream-order flattening would give A5, A1, B4, B3
        expect(res.body.map((e: { message: string }) => e.message)).toEqual(["A5", "B4", "B3", "A1"]);
    });

    it("P2-2: applies the limit to the globally newest entries, not per-stream order", async () => {
        fetchMock.mockResolvedValueOnce({ ok: true, json: async () => MULTI_STREAM_RESPONSE });
        const request = require("supertest");
        const res = await request(app).get("/sensors/logs/Air-1?limit=2");
        expect(res.status).toBe(200);
        // Stream-order truncation would wrongly return A5, A1
        expect(res.body.map((e: { message: string }) => e.message)).toEqual(["A5", "B4"]);
    });

    it("P2-2: preserves nanosecond ordering for timestamps within the same millisecond", async () => {
        // Both timestamps collapse to the same JavaScript millisecond —
        // sorting on the ISO string (or on ms) cannot order them; only the
        // raw nanosecond value can.
        const olderNs = "1791277200123456000";
        const newerNs = "1791277200123456789";
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                data: {
                    resultType: "streams",
                    result: [{ stream: { source: "A" }, values: [[olderNs, "older-ns"], [newerNs, "newer-ns"]] }],
                },
            }),
        });
        const request = require("supertest");
        const res = await request(app).get("/sensors/logs/Air-1");
        expect(res.status).toBe(200);
        expect(res.body.map((e: { message: string }) => e.message)).toEqual(["newer-ns", "older-ns"]);
        // The internal nanosecond sort key must not leak into the API
        for (const entry of res.body) {
            expect(Object.keys(entry).sort()).toEqual(["level", "message", "timestamp"]);
        }
    });

    it("should use the provided end timestamp with the wider 2-hour pagination window", async () => {
        const request = require("supertest");
        const endIso = "2024-01-02T03:04:05.000Z"; // 1704164645 epoch seconds
        await request(app).get(`/sensors/logs/Air-1?end=${encodeURIComponent(endIso)}`);
        const params = urlParams(fetchMock.mock.calls[0][0] as string);
        const end = Number(params.end);
        expect(end).toBe(1_704_164_645);
        // Pagination widens the query window to 2 hours
        expect(Number(params.start)).toBe(end - 2 * 3600);
    });

    it("should fall back to the current time (1-hour window) when end is unparseable", async () => {
        const request = require("supertest");
        const before = Math.floor(Date.now() / 1000);
        await request(app).get("/sensors/logs/Air-1?end=not-a-timestamp");
        const params = urlParams(fetchMock.mock.calls[0][0] as string);
        const end = Number(params.end);
        expect(end).toBeGreaterThanOrEqual(before);
        expect(end).toBeLessThanOrEqual(Math.floor(Date.now() / 1000));
        // Fresh (non-paginated) fetches use the 1-hour window
        expect(Number(params.start)).toBe(end - 1 * 3600);
    });

    // ---- Loki unavailable / unconfigured

    it("should return 500 when Loki is not configured", async () => {
        setConfig({} as any);
        const request = require("supertest");
        const res = await request(app).get("/sensors/logs/Air-1");
        expect(res.status).toBe(500);
        expect(res.body).toHaveProperty("error", "Loki logging not configured");
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("should return 500 when the Loki API responds with an error", async () => {
        fetchMock.mockResolvedValueOnce({
            ok: false,
            status: 503,
            text: async () => "service unavailable",
        });
        const request = require("supertest");
        const res = await request(app).get("/sensors/logs/Air-1");
        expect(res.status).toBe(500);
        expect(res.body.error).toContain("503");
    });
});

describe("logController (loki-url is never logged verbatim)", () => {
    // A URL embedding a credential — if it ever reaches a log line, the
    // regression below catches it
    const SECRET_URL = "http://loki-user:TOP_SECRET_TEST_VALUE@loki.test:3100";

    // Minimal complete configuration satisfying the required keys of configSchema
    const BASE_CONFIG = {
        "log-level": "debug",
        "express-port": 32000,
        "mqtt-broker-ip-address": "10.10.10.64",
        "mqtt-topic-command": "iot/v3/command",
        "mqtt-topic-command-response": "iot/v3/command-response",
        "ip-pinger-web-api": "http://10.10.10.64:3300",
        "case-sensitive": true,
        "db-host": "localhost",
        "db-port": 5432,
        "db-name": "sensor_db",
        "db-user": "sensor_user",
        "db-password": "sensor_pass",
    };

    let app: import("express").Application;
    let fetchMock: jest.Mock;
    const originalFetch = globalThis.fetch;

    function collectMessages(instance: {
        write_info: (o: string, m: string) => void;
        write_warn: (o: string, m: string) => void;
        write_error: (o: string, m: string) => void;
        write_debug: (o: string, m: string) => void;
    }): string[] {
        const messages: string[] = [];
        for (const method of ["write_error", "write_warn", "write_info", "write_debug"] as const) {
            jest.spyOn(instance, method).mockImplementation((_origin: string, message: string) => {
                messages.push(`${method}: ${message}`);
            });
        }
        return messages;
    }

    beforeEach(() => {
        const express = require("express");
        app = express();
        app.use(express.json());
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { CreateLogRoutes } = require("../../../src/routes/logRoutes");
        const logRoutes = new CreateLogRoutes(app);
        logRoutes.register();
        fetchMock = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ data: { resultType: "streams", result: [] } }),
        });
        (globalThis as any).fetch = fetchMock;
    });

    afterEach(() => {
        (globalThis as any).fetch = originalFetch;
        setConfig(undefined as any);
        jest.restoreAllMocks();
    });

    it("should not log the loki-url value on the full fetch path, and still emit the non-sensitive diagnostics", async () => {
        const { createLogger, setConfig: setCfg } = require("../../../src/common/global");
        const { validateConfig } = require("../../../src/schemas/config");
        const config = validateConfig({
            ...BASE_CONFIG,
            "loki-url": SECRET_URL,
            "loki-enabled": true,
        });
        setCfg(config);
        const messages = collectMessages(createLogger(config));

        const request = require("supertest");
        const res = await request(app).get("/sensors/logs/Air-1?level=info");
        expect(res.status).toBe(200);

        // The credential and the URL must never appear in any emitted log line
        for (const m of messages) {
            expect(m).not.toContain("TOP_SECRET_TEST_VALUE");
            expect(m).not.toContain("loki-user");
            expect(m).not.toContain("loki.test:3100");
        }

        // The replacement diagnostics still happen
        expect(messages.some((m) => m.includes("loki-url is set"))).toBe(true);
        expect(messages.some((m) => m.includes("Loki URL configured"))).toBe(true);
        expect(messages.some((m) => m.includes("Loki query_range window:"))).toBe(true);
    });

    it("should log that loki-url is not set when the key is absent", async () => {
        const { createLogger, setConfig: setCfg } = require("../../../src/common/global");
        const { validateConfig } = require("../../../src/schemas/config");
        const config = validateConfig(BASE_CONFIG);
        setCfg(config);
        const messages = collectMessages(createLogger(config));

        const request = require("supertest");
        const res = await request(app).get("/sensors/logs/Air-1");
        expect(res.status).toBe(500); // not configured
        expect(res.body).toHaveProperty("error", "Loki logging not configured");

        expect(messages.some((m) => m.includes("loki-url is not set"))).toBe(true);
        for (const m of messages) {
            expect(m).not.toContain("TOP_SECRET_TEST_VALUE");
        }
    });
});
