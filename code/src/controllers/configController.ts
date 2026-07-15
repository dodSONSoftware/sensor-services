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
 * Reload configuration from disk
 */
async function doReloadConfig(): Promise<{ success: boolean; message: string }> {
    const configPath = findConfigPath();
    if (!configPath) {
        return {
            success: false,
            message: "Could not find config file (tried: " + CONFIG_PATHS.join(", ") + ")"
        };
    }

    const configResult = read_file_yaml<z.infer<typeof configSchema>>(configPath);
    if (configResult.data === null) {
        return {
            success: false,
            message: "Failed to read config: " + (configResult.error ?? "unknown error")
        };
    }

    // Validate against schema
    let validatedConfig: z.infer<typeof configSchema>;
    try {
        validatedConfig = validateConfig(configResult.data);
    } catch (err) {
        return {
            success: false,
            message: "Config validation failed: " + ensureError(err).message
        };
    }

    // Update global config
    setConfig(validatedConfig);

    // Re-create logger with new settings
    createLogger(validatedConfig);

    // Note: MQTT networking would need proper shutdown/restart in a full implementation
    // For now, we just update the config reference

    return {
        success: true,
        message: "Configuration reloaded successfully"
    };
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
            message: "Configuration updated successfully"
        });
    } else {
        res.status(500).json(result);
    }
}
