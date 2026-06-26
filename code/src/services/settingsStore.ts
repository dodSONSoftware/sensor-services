/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import { resolve } from "path";
import yaml from "js-yaml";
import { DEFAULT_SETTINGS, type AppSettings } from "../schemas/settings";
import { read_file_yaml, write_file } from "../dodsonlabs/SystemFunctions";

// Settings file lives in the mounted configs directory (/app/configs/) when running
// in Docker; falls back to src/ for local dev and tests.
const CONTAINER_SETTINGS_FILE = "/app/configs/settings.yml";

function resolveSettingsFile(): string {
    // Try container mount first (works in docker-compose).
    try {
        const fs = require("fs");
        fs.accessSync("/app/configs/", fs.constants.R_OK | fs.constants.W_OK);
        return CONTAINER_SETTINGS_FILE;
    } catch {
        // Local dev / tests — write next to source.
        return resolve(__dirname, "settings.yml");
    }
}

const SETTINGS_FILE = resolveSettingsFile();

let cache: AppSettings;

/**
 * Initialize settings persistence by loading defaults and merging any existing
 * settings.yml on top. Called once at startup from index.ts.
 */
export function init(): void {
    // Start with a fresh copy of defaults.
    cache = structuredClone(DEFAULT_SETTINGS);

    try {
        const result = read_file_yaml<AppSettings>(SETTINGS_FILE);
        if (result.data !== null) {
            for (const [key, value] of Object.entries(result.data)) {
                if (key in DEFAULT_SETTINGS || key in cache) {
                    (cache as Record<string, unknown>)[key] = value;
                }
            }
        }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_err) {
        // File read failed — defaults are already loaded.
    }
}

/**
 * Get a deep copy of the current settings (never returns the internal cache).
 */
export function getSettings(): AppSettings {
    return structuredClone(cache);
}

/**
 * Partially update settings: merge `updates` into the existing cache, persist to YAML file, and return the merged result.
 * Missing keys retain their current values; unknown keys are silently ignored.
 */
export async function patchSettings(updates: Record<string, unknown>): Promise<AppSettings> {
    // Merge updates into cache (unknown keys are safely dropped by type).
    for (const [key, value] of Object.entries(updates)) {
        if (key in DEFAULT_SETTINGS || key in cache) {
            (cache as Record<string, unknown>)[key] = value;
        }
    }

    // Serialize and write to settings.yml (best-effort — don't throw if file system is unavailable).
    try {
        const yamlContent = yaml.dump(cache, { indent: 2, noRefs: true });
        write_file(SETTINGS_FILE, yamlContent);
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    catch (_err) {
        // File write failed — cache is still valid in memory.
    }

    return structuredClone(cache);
}

/**
 * No-op for file-based persistence (was used to close the PostgreSQL pool).
 */
export async function shutdown(): Promise<void> {
    // File-based persistence has no resources to clean up.
}

// Initialize cache at module load time (before routes are registered).
cache = structuredClone(DEFAULT_SETTINGS);
