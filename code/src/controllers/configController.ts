/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import fs from "fs";
import { isDeepStrictEqual } from "util";
import type express from "express";
import { ensureError, read_file_yaml, write_file_atomic } from "../dodsonlabs/SystemFunctions";
import { logger, getConfig, setConfig } from "../common/global";
import type { z } from "zod";
import { validateConfig, type configSchema } from "../schemas/config";
import type * as yamlModule from "js-yaml";

// Config file paths to try (in order)
const CONFIG_PATHS = ["/app/configs/config.yml", "./dist/config.yml"];

/**
 * Configuration keys that take effect immediately on reload: doReloadConfig()
 * updates only these in the active in-memory config and mutates the log level
 * on the existing logger instance (never re-creating it).
 *
 * Note: loki-url/loki-enabled intentionally require a restart. The Loki
 * transport is built once at logger construction and reload leaves it
 * untouched (the logger is never re-created). Applying them at reload would
 * let an unauthenticated /api/write-config caller repoint Loki immediately,
 * streaming every log line to an attacker-controlled host in real time.
 * Restarting makes that change operator-visible.
 *
 * Every other key is captured at construction time by long-lived components
 * (MqttNetworking, middleware, pinger routes, the settings store, and the
 * HTTP servers) and only takes effect after a process restart. Callers must
 * report those keys as restart-required rather than claiming they reloaded.
 */
export const HOT_RELOADABLE_KEYS: readonly string[] = ["log-level"];

/**
 * Compare the running config against a newly validated one and classify the
 * changed keys: hot-reloadable keys are applied live by doReloadConfig();
 * all others require a restart to take effect.
 */
export function diffConfigReload(
    previous: z.infer<typeof configSchema> | null,
    next: z.infer<typeof configSchema>
): { restart_keys: string[]; applied_keys: string[] } {
    const restart_keys: string[] = [];
    const applied_keys: string[] = [];

    // First load — nothing changed relative to the running state
    if (!previous) {
        return { restart_keys, applied_keys };
    }

    const prev = previous as Record<string, unknown>;
    const nextCfg = next as Record<string, unknown>;
    for (const key of new Set([...Object.keys(prev), ...Object.keys(nextCfg)])) {
        // Deep compare — JSON.stringify equality would treat key reordering as
        // a change and report spurious restart-required keys.
        if (isDeepStrictEqual(prev[key], nextCfg[key])) {
            continue;
        }
        if (HOT_RELOADABLE_KEYS.includes(key)) {
            applied_keys.push(key);
        } else {
            restart_keys.push(key);
        }
    }

    return { restart_keys: restart_keys.sort(), applied_keys: applied_keys.sort() };
}

// Export for testing - allows overriding the config path
export let TEST_CONFIG_PATH: string | null = null;

/**
 * Set the test config path (for testing only)
 */
export function setTestConfigPath(path: string | null) {
    TEST_CONFIG_PATH = path;
}

/**
 * Find the active config file path
 */
function findConfigPath(): string | null {
    // Use test path if set
    if (TEST_CONFIG_PATH) {
        try {
            fs.accessSync(TEST_CONFIG_PATH);
            return TEST_CONFIG_PATH;
        } catch {
            return null;
        }
    }

    for (const path of CONFIG_PATHS) {
        try {
            fs.accessSync(path);
            return path;
        } catch {
            continue;
        }
    }
    return null;
}

/**
 * Result of a config reload: success plus the reload contract — which changed
 * keys were applied live and which require a restart to take effect.
 */
interface ReloadResult {
    success: boolean;
    message: string;
    restart_required: boolean;
    restart_keys: string[];
    applied_keys: string[];
}

function reloadFailure(message: string): ReloadResult {
    return { success: false, message, restart_required: false, restart_keys: [], applied_keys: [] };
}

/**
 * Reload configuration from disk. Only keys in HOT_RELOADABLE_KEYS change at
 * runtime: the active in-memory config is updated with those values alone,
 * and the log level is mutated on the existing logger instance. Restart-
 * required values stay in the file (desired state) until a restart; they must
 * not leak into the active config, because long-lived components keep their
 * construction-time snapshots and /api/read-running-config reports what is
 * actually running (/api/read-config reports the persisted file).
 */
async function doReloadConfig(): Promise<ReloadResult> {
    const configPath = findConfigPath();
    if (!configPath) {
        return reloadFailure("Could not find config file (tried: " + CONFIG_PATHS.join(", ") + ")");
    }

    // Read the selected config.yml directly — the same single file the
    // process started with.
    const configResult = read_file_yaml<Record<string, unknown>>(configPath);
    if (configResult.data === null) {
        return reloadFailure("Failed to read config: " + (configResult.error ?? "unknown error"));
    }

    // Validate against schema
    let validatedConfig: z.infer<typeof configSchema>;
    try {
        validatedConfig = validateConfig(configResult.data);
    } catch (err) {
        return reloadFailure("Config validation failed: " + ensureError(err).message);
    }

    // Classify the changes before updating the running state
    const { restart_keys, applied_keys } = diffConfigReload(getConfig() ?? null, validatedConfig);

    // Update the ACTIVE config with only the hot-reloadable keys — everything
    // else in validatedConfig only becomes active after a restart.
    const current = getConfig();
    if (current) {
        const effectiveConfig = { ...current } as Record<string, unknown>;
        for (const key of HOT_RELOADABLE_KEYS) {
            effectiveConfig[key] = (validatedConfig as Record<string, unknown>)[key];
        }
        setConfig(effectiveConfig as z.infer<typeof configSchema>);
    } else {
        // First load — no running state to preserve
        setConfig(validatedConfig);
    }

    // Change the log level on the EXISTING logger instance. Recreating the
    // logger would close it while MqttNetworking and controllers still hold
    // references to the old instance. Loki transports are untouched — loki
    // settings remain restart-required.
    const activeLogger = logger();
    if (activeLogger) {
        activeLogger.setLevel(validatedConfig["log-level"]);
    }

    const restart_required = restart_keys.length > 0;
    const message = restart_required
        ? "Configuration reloaded; restart required for: " + restart_keys.join(", ")
        : "Configuration reloaded successfully";

    return { success: true, message, restart_required, restart_keys, applied_keys };
}

/**
 * GET /reload-config: Hot-reload configuration from disk
 */
export async function reloadConfig(_req: express.Request, res: express.Response): Promise<void> {
    const result = await doReloadConfig();
    res.status(result.success ? 200 : 500).json(result);
}

/**
 * GET /read-config: Return the persisted configuration (config.yml).
 * Reads and validates the same single file the process started from and
 * /api/write-config writes, so a read → modify → write round trip preserves
 * pending (restart-required) changes instead of silently reverting them.
 * Pure read — no disk reload side effects (that is /reload-config's job).
 * Returns the COMPLETE configuration — including db-password and loki-url.
 * This trusted deployment's /api/write-config consumes the whole document,
 * so every value must survive the round trip (secrets are still kept out of
 * logs via redactConfig()). The active in-memory configuration is
 * /api/read-running-config's job.
 */
export function readConfig(_req: express.Request, res: express.Response): void {
    const configPath = findConfigPath();
    if (!configPath) {
        res.status(500).json({
            error: "Could not find config file (tried: " + CONFIG_PATHS.join(", ") + ")"
        });
        return;
    }

    // Read the persisted config.yml directly — the same single file the
    // process started with.
    const configResult = read_file_yaml<Record<string, unknown>>(configPath);
    if (configResult.data == null) {
        res.status(500).json({
            error: "Failed to read config: " + (configResult.error ?? "unknown error")
        });
        return;
    }

    try {
        res.json(validateConfig(configResult.data));
    } catch (err) {
        // The thrown message already carries the "Config validation failed:"
        // prefix — do not duplicate it.
        res.status(500).json({ error: ensureError(err).message });
    }
}

/**
 * GET /read-running-config: Return the active in-memory (running)
 * configuration. Only the hot-reloadable keys (log-level) track
 * /api/write-config changes live; every other key reports the value the
 * process is actually running (construction-time snapshot) until a restart.
 * Returns the COMPLETE configuration — including db-password and loki-url.
 * Use /api/read-config for the persisted (on-disk) configuration.
 */
export function readRunningConfig(_req: express.Request, res: express.Response): void {
    const config = getConfig();

    if (!config) {
        res.status(500).json({ error: "Configuration not initialized" });
        return;
    }

    res.json(config);
}

/**
 * POST /write-config: Save new configuration and reload
 */
export async function writeConfig(req: express.Request, res: express.Response): Promise<void> {
    const loggerInstance = logger();
    const configPath = findConfigPath();

    if (!configPath) {
        res.status(500).json({
            success: false,
            message: "Could not find config file (tried: " + CONFIG_PATHS.join(", ") + ")"
        });
        return;
    }

    // Validate request body
    const body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        res.status(400).json({
            success: false,
            message: "Request body must be a JSON object"
        });
        return;
    }

    // Check for empty object
    if (Object.keys(body).length === 0) {
        res.status(400).json({
            success: false,
            message: "Request body must be a JSON object"
        });
        return;
    }

    // Validate against schema
    let validatedConfig: z.infer<typeof configSchema>;
    try {
        validatedConfig = validateConfig(body);
    } catch (err) {
        res.status(400).json({
            success: false,
            message: "Config validation failed: " + ensureError(err).message
        });
        return;
    }

    // Write to file — atomically (same-directory temp file + rename) so a
    // failure mid-write can never truncate the live config the service
    // restarts from
    const yaml = require("js-yaml") as typeof yamlModule;
    const yamlContent = yaml.dump(validatedConfig);

    if (!write_file_atomic(configPath, yamlContent, loggerInstance)) {
        res.status(500).json({
            success: false,
            message: "Failed to write config file"
        });
        return;
    }

    // Reload the config (updates global state and logger)
    const result = await doReloadConfig();
    if (result.success) {
        res.status(200).json({
            success: true,
            message: result.restart_required
                ? "Configuration saved; restart required for: " + result.restart_keys.join(", ")
                : "Configuration updated successfully",
            restart_required: result.restart_required,
            restart_keys: result.restart_keys,
            applied_keys: result.applied_keys
        });
    } else {
        res.status(500).json(result);
    }
}
