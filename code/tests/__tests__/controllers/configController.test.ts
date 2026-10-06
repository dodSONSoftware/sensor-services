/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import fs from "fs";
import os from "os";
import path from "path";
import type express from "express";
import {
    diffConfigReload,
    readConfig,
    reloadConfig,
    setTestConfigPath,
    writeConfig,
} from "../../../src/controllers/configController";
import { createMockRes, createMockReq } from "../../mocks/express";
import { setConfig } from "../../../src/common/global";
import { validateConfig } from "../../../src/schemas/config";

/**
 * Minimal complete configuration satisfying the required keys of configSchema.
 */
const BASE_CONFIG = {
    "log-level": "info",
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

let tmpDir: string;
let configPath: string;

function writeConfigFile(obj: unknown): void {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const yaml = require("js-yaml") as { dump: (v: unknown) => string };
    fs.writeFileSync(configPath, yaml.dump(obj));
}

beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "config-controller-test-"));
    configPath = path.join(tmpDir, "config.yml");
});

afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
});

beforeEach(() => {
    setTestConfigPath(configPath);
});

afterEach(() => {
    setTestConfigPath(null);
    setConfig(undefined);
});

describe("diffConfigReload", () => {
    it("should report no changes on first load (no running config)", () => {
        const next = validateConfig(BASE_CONFIG);
        expect(diffConfigReload(null, next)).toEqual({ restart_keys: [], applied_keys: [] });
    });

    it("should report no changes when configs are identical", () => {
        const previous = validateConfig(BASE_CONFIG);
        const next = validateConfig(BASE_CONFIG);
        expect(diffConfigReload(previous, next)).toEqual({ restart_keys: [], applied_keys: [] });
    });

    it("should classify logger keys as applied and everything else as restart-required", () => {
        const previous = validateConfig(BASE_CONFIG);
        const next = validateConfig({
            ...BASE_CONFIG,
            "log-level": "debug",
            "mqtt-topic-command": "iot/v9/command",
            "express-body-limit": "2mb",
        });

        const { restart_keys, applied_keys } = diffConfigReload(previous, next);

        expect(applied_keys).toEqual(["log-level"]);
        expect(restart_keys).toEqual(["express-body-limit", "mqtt-topic-command"]);
    });

    it("should count an optional key removed from the config as a change", () => {
        const previous = validateConfig({ ...BASE_CONFIG, "loki-url": "http://loki:3100" });
        const next = validateConfig(BASE_CONFIG);
        // loki-url is not hot-reloadable — removing it requires a restart
        const { restart_keys, applied_keys } = diffConfigReload(previous, next);
        expect(restart_keys).toEqual(["loki-url"]);
        expect(applied_keys).toEqual([]);
    });

    it("should report loki settings as restart-required, not applied", () => {
        const previous = validateConfig(BASE_CONFIG);
        const next = validateConfig({
            ...BASE_CONFIG,
            "loki-url": "http://loki:3100",
            "loki-enabled": true,
        });

        const { restart_keys, applied_keys } = diffConfigReload(previous, next);

        // Hot-reloading loki-url would repoint the log transport live, letting
        // an unauthenticated caller stream logs to an attacker host instantly.
        expect(applied_keys).toEqual([]);
        expect(restart_keys).toEqual(["loki-enabled", "loki-url"]);
    });
});

describe("reloadConfig (GET /api/reload-config)", () => {
    it("should report restart_required when an operational key changes (regression)", async () => {
        // Contract from the bug report: changing an operational property like
        // mqtt-topic-command must NOT claim the new value is active — the API
        // must explicitly report that a restart is required.
        setConfig(validateConfig(BASE_CONFIG));
        writeConfigFile({ ...BASE_CONFIG, "mqtt-topic-command": "iot/v9/command" });

        const { res, statusCalls, sendCalls } = createMockRes();
        await reloadConfig(createMockReq() as express.Request, res as express.Response);

        expect(statusCalls).toContain(200);
        const body = sendCalls[0] as Record<string, unknown>;
        expect(body.success).toBe(true);
        expect(body.restart_required).toBe(true);
        expect(body.restart_keys).toEqual(["mqtt-topic-command"]);
        expect(body.applied_keys).toEqual([]);
        expect(body.message).toBe("Configuration reloaded; restart required for: mqtt-topic-command");
    });

    it("should apply logger-only changes without a restart", async () => {
        setConfig(validateConfig(BASE_CONFIG));
        writeConfigFile({ ...BASE_CONFIG, "log-level": "debug" });

        const { res, sendCalls } = createMockRes();
        await reloadConfig(createMockReq() as express.Request, res as express.Response);

        const body = sendCalls[0] as Record<string, unknown>;
        expect(body.success).toBe(true);
        expect(body.restart_required).toBe(false);
        expect(body.restart_keys).toEqual([]);
        expect(body.applied_keys).toEqual(["log-level"]);
        expect(body.message).toBe("Configuration reloaded successfully");
    });

    it("should report no restart required when nothing changed", async () => {
        setConfig(validateConfig(BASE_CONFIG));
        writeConfigFile(BASE_CONFIG);

        const { res, sendCalls } = createMockRes();
        await reloadConfig(createMockReq() as express.Request, res as express.Response);

        const body = sendCalls[0] as Record<string, unknown>;
        expect(body.success).toBe(true);
        expect(body.restart_required).toBe(false);
        expect(body.restart_keys).toEqual([]);
    });

    it("should report no restart keys on first load (no running config)", async () => {
        setConfig(undefined);
        writeConfigFile(BASE_CONFIG);

        const { res, sendCalls } = createMockRes();
        await reloadConfig(createMockReq() as express.Request, res as express.Response);

        const body = sendCalls[0] as Record<string, unknown>;
        expect(body.success).toBe(true);
        expect(body.restart_required).toBe(false);
        expect(body.restart_keys).toEqual([]);
    });

    it("should list every changed operational key", async () => {
        setConfig(validateConfig(BASE_CONFIG));
        writeConfigFile({
            ...BASE_CONFIG,
            "mqtt-broker-ip-address": "10.0.0.1",
            "express-body-limit": "2mb",
            "log-level": "debug",
        });

        const { res, sendCalls } = createMockRes();
        await reloadConfig(createMockReq() as express.Request, res as express.Response);

        const body = sendCalls[0] as Record<string, unknown>;
        expect(body.restart_required).toBe(true);
        expect(body.restart_keys).toEqual(["express-body-limit", "mqtt-broker-ip-address"]);
        expect(body.applied_keys).toEqual(["log-level"]);
    });
});

describe("hot reload runtime state (no split-brain config)", () => {
    // Regression: a reload whose file changed restart-required keys must NOT
    // install those values into the active in-memory config — long-lived
    // components (MqttNetworking, pinger routes, the settings store) keep
    // their construction-time snapshots, and /api/read-config must report
    // what is actually running. Only HOT_RELOADABLE_KEYS (log-level) may
    // change, and the log level must change on the existing logger instance,
    // not by replacing/closing it.
    const CONFIG_A = {
        ...BASE_CONFIG,
        "log-level": "info",
        "mqtt-broker-ip-address": "10.0.0.11",
        "loki-url": "http://loki-a:3100",
        "ip-pinger-web-api": "http://pinger-a:3300",
    };
    const CONFIG_B = {
        ...CONFIG_A,
        "log-level": "debug",
        "mqtt-broker-ip-address": "10.0.0.22",
        "loki-url": "http://loki-b:3100",
        "ip-pinger-web-api": "http://pinger-b:3300",
    };

    it("should apply only log-level, keep restart-required values inactive, and keep the logger instance", async () => {
        const { createLogger, logger, getConfig } = require("../../../src/common/global");
        setConfig(validateConfig(CONFIG_A));
        const runningLogger = createLogger(validateConfig(CONFIG_A));
        const closeSpy = jest.spyOn(runningLogger, "close");

        writeConfigFile(CONFIG_B);
        const { res, sendCalls } = createMockRes();
        await reloadConfig(createMockReq() as express.Request, res as express.Response);

        const body = sendCalls[0] as Record<string, unknown>;
        expect(body.success).toBe(true);
        expect(body.applied_keys).toContain("log-level");
        expect(body.restart_keys).toEqual(expect.arrayContaining([
            "ip-pinger-web-api",
            "loki-url",
            "mqtt-broker-ip-address",
        ]));

        // Runtime state: log-level applied live, everything else still at CONFIG_A
        const active = getConfig() as Record<string, unknown>;
        expect(active["log-level"]).toBe("debug");
        expect(active["mqtt-broker-ip-address"]).toBe("10.0.0.11");
        expect(active["loki-url"]).toBe("http://loki-a:3100");
        expect(active["ip-pinger-web-api"]).toBe("http://pinger-a:3300");

        // Logger identity: same instance, level changed in place, never closed
        expect(logger()).toBe(runningLogger);
        expect(runningLogger.global_log_level_string()).toBe("debug");
        expect(closeSpy).not.toHaveBeenCalled();

        // The old logger is still usable by long-lived components holding it
        runningLogger.write_info("test", "old logger still functional");
    });

    it("should make /api/read-config report the effective active configuration", async () => {
        setConfig(validateConfig(CONFIG_A));
        require("../../../src/common/global").createLogger(validateConfig(CONFIG_A));

        writeConfigFile(CONFIG_B);
        await reloadConfig(createMockReq() as express.Request, (createMockRes().res) as express.Response);

        const { res, sendCalls } = createMockRes();
        readConfig(createMockReq() as express.Request, res as express.Response);
        const body = sendCalls[0] as Record<string, unknown>;

        // Restart-required values are reported as ACTIVE (old) values, not the
        // new file values; the complete config is returned (no masking).
        expect(body["mqtt-broker-ip-address"]).toBe("10.0.0.11");
        expect(body["ip-pinger-web-api"]).toBe("http://pinger-a:3300");
        expect(body["loki-url"]).toBe("http://loki-a:3100");
        expect(body["log-level"]).toBe("debug");
    });
});

describe("writeConfig (POST /api/write-config)", () => {
    it("should persist the config and report restart_required for operational changes", async () => {
        setConfig(validateConfig(BASE_CONFIG));
        const body = { ...BASE_CONFIG, "mqtt-broker-ip-address": "10.0.0.9", "db-port": 5433 };

        const { res, statusCalls, sendCalls } = createMockRes();
        await writeConfig(createMockReq({ body }) as express.Request, res as express.Response);

        expect(statusCalls).toContain(200);
        const response = sendCalls[0] as Record<string, unknown>;
        expect(response.success).toBe(true);
        expect(response.restart_required).toBe(true);
        expect(response.restart_keys).toEqual(["db-port", "mqtt-broker-ip-address"]);
        expect(response.message).toBe("Configuration saved; restart required for: db-port, mqtt-broker-ip-address");

        // The new values were actually persisted to disk, and the complete
        // config (including db-password) was written directly to config.yml
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const yaml = require("js-yaml") as { load: (v: string) => unknown };
        const onDisk = yaml.load(fs.readFileSync(configPath, "utf-8")) as Record<string, unknown>;
        expect(onDisk["mqtt-broker-ip-address"]).toBe("10.0.0.9");
        expect(onDisk["db-port"]).toBe(5433);
        expect(onDisk["db-password"]).toBe("sensor_pass");
    });

    it("should report restart_required when loki settings change (hot-reload disabled for loki)", async () => {
        setConfig(validateConfig(BASE_CONFIG));
        // loki-enabled stays false on purpose: enabling it would make createLogger
        // open a real Loki transport and keep Jest's event loop alive.
        const body = { ...BASE_CONFIG, "log-level": "warn", "loki-url": "http://loki:3100" };

        const { res, statusCalls, sendCalls } = createMockRes();
        await writeConfig(createMockReq({ body }) as express.Request, res as express.Response);

        expect(statusCalls).toContain(200);
        const response = sendCalls[0] as Record<string, unknown>;
        expect(response.success).toBe(true);
        expect(response.restart_required).toBe(true);
        expect(response.restart_keys).toEqual(["loki-url"]);
        expect(response.applied_keys).toEqual(["log-level"]);

        // The complete config (including loki-url and db-password) was written
        // directly to config.yml
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const yaml = require("js-yaml") as { load: (v: string) => unknown };
        const onDisk = yaml.load(fs.readFileSync(configPath, "utf-8")) as Record<string, unknown>;
        expect(onDisk["loki-url"]).toBe("http://loki:3100");
        expect(onDisk["db-password"]).toBe("sensor_pass");
    });

    it("should reject an invalid body with 400 without writing to disk", async () => {
        setConfig(validateConfig(BASE_CONFIG));
        // A previous test may have written the file — snapshot it and verify
        // the rejected request leaves it untouched.
        const before = fs.existsSync(configPath) ? fs.readFileSync(configPath, "utf-8") : null;
        const body = { ...BASE_CONFIG, "log-level": "verbose" };

        const { res, statusCalls, sendCalls } = createMockRes();
        await writeConfig(createMockReq({ body }) as express.Request, res as express.Response);

        expect(statusCalls).toContain(400);
        const response = sendCalls[0] as Record<string, unknown>;
        expect(response.success).toBe(false);
        const after = fs.existsSync(configPath) ? fs.readFileSync(configPath, "utf-8") : null;
        expect(after).toBe(before);
    });
});

describe("readConfig (GET /api/read-config)", () => {
    it("should return the complete configuration, including db-password and loki-url", () => {
        setConfig(validateConfig({
            ...BASE_CONFIG,
            "loki-url": "http://loki:3100",
        }));

        const { res, sendCalls } = createMockRes();
        readConfig(createMockReq() as express.Request, res as express.Response);

        // res.json() without an explicit status — Express defaults to 200
        const body = sendCalls[0] as Record<string, unknown>;
        expect(body["db-password"]).toBe("sensor_pass");
        expect(body["loki-url"]).toBe("http://loki:3100");
        // all other values are returned as-is
        expect(body["db-host"]).toBe("localhost");
        expect(body["mqtt-broker-ip-address"]).toBe("10.10.10.64");
    });

    it("should not mutate the running config", () => {
        setConfig(validateConfig(BASE_CONFIG));

        const { res } = createMockRes();
        readConfig(createMockReq() as express.Request, res as express.Response);

        const { getConfig } = require("../../../src/common/global");
        expect(getConfig()["db-password"]).toBe("sensor_pass");
    });

    it("should return 500 when the config is not initialized", () => {
        setConfig(undefined);

        const { res, statusCalls } = createMockRes();
        readConfig(createMockReq() as express.Request, res as express.Response);

        expect(statusCalls).toContain(500);
    });
});

describe("read → modify → write round trip (regression)", () => {
    it("preserves db-password and loki-url when only an unrelated key changes", async () => {
        // Start with a complete config.yml on disk
        writeConfigFile({
            ...BASE_CONFIG,
            "db-password": "original-password",
            "loki-url": "http://loki:3100",
            "log-level": "info",
        });
        // Prime the running config from disk so readConfig has something to serve
        await reloadConfig(createMockReq() as express.Request, (createMockRes().res) as express.Response);

        // 1. Read the complete configuration
        const readMock = createMockRes();
        readConfig(createMockReq() as express.Request, readMock.res as express.Response);
        const config = readMock.sendCalls[0] as Record<string, unknown>;
        expect(config["db-password"]).toBe("original-password");
        expect(config["loki-url"]).toBe("http://loki:3100");

        // 2. Modify only an unrelated setting
        config["log-level"] = "debug";

        // 3. Write the complete returned configuration back
        const writeMock = createMockRes();
        await writeConfig(createMockReq({ body: config }) as express.Request, writeMock.res as express.Response);
        expect((writeMock.sendCalls[0] as Record<string, unknown>).success).toBe(true);

        // 4. The file on disk keeps the credentials; only log-level changed
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const yaml = require("js-yaml") as { load: (v: string) => unknown };
        const written = yaml.load(fs.readFileSync(configPath, "utf-8")) as Record<string, unknown>;
        expect(written["db-password"]).toBe("original-password");
        expect(written["loki-url"]).toBe("http://loki:3100");
        expect(written["log-level"]).toBe("debug");

        // 5. The result still validates as a complete configuration
        expect(() => validateConfig(written)).not.toThrow();
    });
});
