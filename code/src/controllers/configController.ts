/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import fs from "fs";
import type express from "express";
import { ensureError, read_file_yaml, write_file } from "../dodsonlabs/SystemFunctions";
import { logger, getConfig, setConfig, createLogger } from "../common/global";
import type { z } from "zod";
import { validateConfig, type configSchema } from "../schemas/config";
import type * as yamlModule from "js-yaml";

// Config file paths to try (in order)
const CONFIG_PATHS = ["/app/configs/config.yml", "./dist/config.yml"];

/**
 * Configuration keys that take effect immediately on reload: the logger is
 * re-created and every log path (including logController's Loki lookup) reads
 * the current logger/config live at request time.
 *
 * Every other key is captured at construction time by long-lived components
 * (MqttNetworking, middleware, pinger routes, the settings store, and the
 * HTTP servers) and only takes effect after a process restart. Callers must
 * report those keys as restart-required rather than claiming they reloaded.
 */
export const HOT_RELOADABLE_KEYS: readonly string[] = ["log-level", "loki-url", "loki-enabled"];

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
        if (JSON.stringify(prev[key]) === JSON.stringify(nextCfg[key])) {
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
 * Reload configuration from disk. The global config reference and the logger
 * are updated immediately; long-lived components keep their construction-time
 * snapshots until restart, so any changed key outside HOT_RELOADABLE_KEYS is
 * reported as restart-required.
 */
async function doReloadConfig(): Promise<ReloadResult> {
    const configPath = findConfigPath();
    if (!configPath) {
        return reloadFailure("Could not find config file (tried: " + CONFIG_PATHS.join(", ") + ")");
    }

    const configResult = read_file_yaml<z.infer<typeof configSchema>>(configPath);
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

    // Classify the changes before replacing the running config
    const { restart_keys, applied_keys } = diffConfigReload(getConfig() ?? null, validatedConfig);

    // Update global config reference and re-create the logger — the only
    // components that pick up new values without a restart
    setConfig(validatedConfig);
    createLogger(validatedConfig);

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
 * GET /read-config: Read and return current configuration (with hot-reload)
 */
export async function readConfig(_req: express.Request, res: express.Response): Promise<void> {
    // First reload from disk to get the latest configuration
    const result = await doReloadConfig();

    if (!result.success) {
        res.status(500).json({ error: "Failed to reload configuration: " + result.message });
        return;
    }

    // Then return the current configuration
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

    // Write to file
    const yaml = require("js-yaml") as typeof yamlModule;
    const yamlContent = yaml.dump(validatedConfig);

    if (!write_file(configPath, yamlContent, loggerInstance)) {
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
