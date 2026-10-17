/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

// P1-1 regression tests: the application is the sole owner of SIGINT/SIGTERM
// and process termination. The Loki transport must NOT register its own
// exit hook (gracefulShutdown: false), and the application-controlled
// shutdown must explicitly flush/close the Loki transport in a bounded way.

// ---- winston-loki mock -------------------------------------------------------
// Replaces the real transport so constructing a Logger never performs DNS/HTTP
// against a Loki host and never registers the async-exit-hook. The mock returns
// a genuine winston-transport WritableStream (so winston.createLogger accepts
// it) that also exposes the flush/batcher surface the application uses at
// shutdown. Each instance records the options it was constructed with.
const mockLokiInstances: any[] = [];

jest.mock("winston-loki", () => {
    const Transport = jest.requireActual("winston-transport");
    return {
        __esModule: true,
        default: jest.fn(function (this: unknown, opts: any) {
            const inst = Object.create(Transport.prototype);
            (Transport as any).call(inst, opts);
            inst.__opts = opts;
            inst.log = (info: any, callback: () => void) => {
                setImmediate(() => inst.emit("logged", info));
                callback();
            };
            inst.flush = jest.fn().mockResolvedValue(null);
            inst.close = jest.fn();
            inst.batcher = { close: jest.fn((cb?: () => void) => cb?.()) };
            mockLokiInstances.push(inst);
            return inst;
        }),
    };
});

// Import after the mock is registered
import { Logger, closeLokiTransportBounded, LOKI_CLOSE_TIMEOUT_MS } from "../../../src/dodsonlabs/Logger";
import { SECRET_MASK } from "../../../src/dodsonlabs/SystemFunctions";
import type { configSchema } from "../../../src/schemas/config";
import type { z } from "zod";

// A minimal valid config with Loki enabled.
function lokiConfig(): z.infer<typeof configSchema> {
    return {
        "log-level": "info",
        "express-port": 32000,
        "mqtt-broker-ip-address": "127.0.0.1",
        "mqtt-topic-command": "c",
        "mqtt-topic-command-response": "cr",
        "ip-pinger-web-api": "http://localhost:32001",
        "case-sensitive": true,
        "db-host": "localhost",
        "db-port": 5432,
        "db-name": "test",
        "db-user": "u",
        "db-password": "p",
        "loki-url": "http://localhost:3100",
        "loki-enabled": true,
    } as unknown as z.infer<typeof configSchema>;
}

function noLokiConfig(): z.infer<typeof configSchema> {
    return {
        ...lokiConfig(),
        "loki-url": undefined,
        "loki-enabled": undefined,
    } as unknown as z.infer<typeof configSchema>;
}

describe("Logger — Loki shutdown ownership (P1-1)", () => {
    beforeEach(() => {
        mockLokiInstances.length = 0;
    });

    it("constructs the Loki transport with gracefulShutdown: false (no independent exit hook)", () => {
        new Logger(lokiConfig());
        expect(mockLokiInstances.length).toBe(1);
        expect(mockLokiInstances[0].__opts).toEqual(
            expect.objectContaining({ gracefulShutdown: false })
        );
    });

    it("does not create a Loki transport (and thus no exit hook) when loki is disabled", () => {
        new Logger(noLokiConfig());
        expect(mockLokiInstances.length).toBe(0);
    });

    it("close() explicitly flushes and closes the Loki transport, then wins winston close", async () => {
        const lg = new Logger(lokiConfig());
        const loki = mockLokiInstances[0];

        await lg.close();

        // The bounded flush/close path was exercised
        expect(loki.flush).toHaveBeenCalledTimes(1);
        expect(loki.batcher.close).toHaveBeenCalledTimes(1);
    });

    it("close() is idempotent — a second call does not re-flush", async () => {
        const lg = new Logger(lokiConfig());
        const loki = mockLokiInstances[0];

        await lg.close();
        await lg.close();

        expect(loki.flush).toHaveBeenCalledTimes(1);
        expect(loki.batcher.close).toHaveBeenCalledTimes(1);
    });

    it("close() resolves when there is no Loki transport (console only)", async () => {
        const lg = new Logger(noLokiConfig());
        await expect(lg.close()).resolves.toBeUndefined();
    });
});

describe("closeLokiTransportBounded (P1-1)", () => {
    function fakeTransport(overrides: Record<string, unknown> = {}) {
        return {
            flush: jest.fn().mockResolvedValue(null),
            close: jest.fn(),
            batcher: { close: jest.fn((cb?: () => void) => cb?.()) },
            ...overrides,
        };
    }

    it("is a no-op for a null transport", async () => {
        await expect(closeLokiTransportBounded(null)).resolves.toBeUndefined();
    });

    it("flushes and stops the batch loop when both succeed", async () => {
        const t = fakeTransport();
        await closeLokiTransportBounded(t, 1000);
        expect(t.flush).toHaveBeenCalledTimes(1);
        expect(t.batcher.close).toHaveBeenCalledTimes(1);
    });

    it("still closes the batcher even when flush() rejects (bounded, best-effort)", async () => {
        const t = fakeTransport({ flush: jest.fn().mockRejectedValue(new Error("loki down")) });
        await expect(closeLokiTransportBounded(t, 1000)).resolves.toBeUndefined();
        // The rejection is swallowed and the close still happens
        expect(t.batcher.close).toHaveBeenCalledTimes(1);
    });

    it("completes within the bound when flush() never resolves", async () => {
        const neverResolves = new Promise<never>(() => { /* never */ });
        const t = fakeTransport({ flush: jest.fn().mockReturnValue(neverResolves) });
        const started = Date.now();
        await expect(closeLokiTransportBounded(t, 50)).resolves.toBeUndefined();
        // Bounded by the 50ms deadline, not by the hung flush
        expect(Date.now() - started).toBeLessThan(2000);
    });

    it("defaults to the exported LOKI_CLOSE_TIMEOUT_MS bound", async () => {
        // Sanity: the documented default is a small, finite bound
        expect(LOKI_CLOSE_TIMEOUT_MS).toBeGreaterThan(0);
        expect(LOKI_CLOSE_TIMEOUT_MS).toBeLessThanOrEqual(10_000);
    });
});

describe("Logger — central two-tier redaction", () => {
    // Distinctive secrets for the redaction config: both clear the value-tier
    // minimum length, and the loki-url embeds credentials in the URL itself.
    const R_DB = "Sup3rDbSecretValue";
    const R_LOKI = "http://loki-user:LokiSecret99@loki.test:3100";

    function redactionConfig(): z.infer<typeof configSchema> {
        return {
            ...lokiConfig(),
            // debug so all four write_* methods pass the winston level gate
            "log-level": "debug",
            "db-password": R_DB,
            "loki-url": R_LOKI,
        } as unknown as z.infer<typeof configSchema>;
    }

    /**
     * Capture what each transport receives. Winston applies a transport's
     * format inside the transport itself, so spying transport.log yields the
     * exact info object (redacted message) handed to each backend. Spying the
     * console transport also suppresses real stdout during the tests.
     * (Do NOT spy console.log — winston binds it at transport construction.)
     */
    function captureTransports(lg: Logger) {
        const consoleLines: string[] = [];
        const lokiLines: string[] = [];
        const wins = (lg as any).winston;
        const consoleTransport = wins.transports.find((t: any) => t.name === "console");
        jest.spyOn(consoleTransport, "log").mockImplementation((info: any, cb: () => void) => {
            consoleLines.push(info.message);
            cb();
        });
        const loki = mockLokiInstances[mockLokiInstances.length - 1];
        if (loki) {
            loki.log = (info: any, cb: () => void) => {
                lokiLines.push(info.message);
                cb();
            };
        }
        return { consoleLines, lokiLines };
    }

    beforeEach(() => {
        mockLokiInstances.length = 0;
    });

    it("masks the db-password value in every emitted line (value tier)", () => {
        const lg = new Logger(redactionConfig());
        const { consoleLines, lokiLines } = captureTransports(lg);

        lg.write_info("t", `connected with ${R_DB} at 12:00`);

        expect(consoleLines).toHaveLength(1);
        expect(lokiLines).toHaveLength(1);
        for (const line of [...consoleLines, ...lokiLines]) {
            expect(line).toContain(SECRET_MASK);
            expect(line).not.toContain(R_DB);
        }
    });

    it("masks the loki-url value including embedded credentials (value tier)", () => {
        const lg = new Logger(redactionConfig());
        const { consoleLines, lokiLines } = captureTransports(lg);

        lg.write_info("t", `Loki push to ${R_LOKI}`);

        for (const line of [...consoleLines, ...lokiLines]) {
            expect(line).toContain(SECRET_MASK);
            expect(line).not.toContain("LokiSecret99");
            expect(line).not.toContain("loki-user");
            expect(line).not.toContain(R_LOKI);
        }
    });

    it("masks unknown-value secrets in key-value form (key tier) — the forwarded-sensor-log gap", () => {
        const lg = new Logger(redactionConfig());
        const { consoleLines, lokiLines } = captureTransports(lg);

        lg.write_error(
            "MqttNetworking::log",
            "[Air-1] " + JSON.stringify({ "wifi-password": "SensorWifiPw1", rssi: -42 })
        );

        for (const line of [...consoleLines, ...lokiLines]) {
            expect(line).not.toContain("SensorWifiPw1");
            expect(line).toContain('"wifi-password":********');
            expect(line).toContain('"rssi":-42');
        }
    });

    it("applies redaction in all four write_* methods", () => {
        const lg = new Logger(redactionConfig());
        const { consoleLines } = captureTransports(lg);

        for (const method of ["write_debug", "write_info", "write_warn", "write_error"] as const) {
            lg[method]("t", `attempting with ${R_DB}`);
        }

        expect(consoleLines).toHaveLength(4);
        for (const line of consoleLines) {
            expect(line).toContain(SECRET_MASK);
            expect(line).not.toContain(R_DB);
        }
    });

    it("leaves non-secret messages untouched", () => {
        const lg = new Logger(redactionConfig());
        const { consoleLines } = captureTransports(lg);

        lg.write_info("t", "hello world");

        expect(consoleLines).toEqual(["hello world"]);
    });

    it("short secrets skip the value tier but are still key-masked", () => {
        const lg = new Logger({
            ...redactionConfig(),
            "db-password": "x",
            "loki-url": undefined,
            "loki-enabled": undefined,
        } as unknown as z.infer<typeof configSchema>);
        const { consoleLines } = captureTransports(lg);

        lg.write_info("t", "note: x");
        lg.write_info("t", '{"db-password": "x"}');

        expect(consoleLines[0]).toBe("note: x");
        expect(consoleLines[1]).toBe('{"db-password": ********}');
    });

    it("does not alter Loki transport options", () => {
        new Logger(redactionConfig());
        const loki = mockLokiInstances[mockLokiInstances.length - 1];
        expect(loki.__opts).toEqual(expect.objectContaining({ gracefulShutdown: false }));
    });
});
