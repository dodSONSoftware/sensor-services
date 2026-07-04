/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import { Pool } from "pg";
import type { z } from "zod";
import type { configSchema } from "../schemas/config";
import { DEFAULT_SETTINGS, SETTINGS_SCHEMA, type AppSettings } from "../schemas/settings";
import { ensureError } from "../dodsonlabs/SystemFunctions";

let pool: Pool | null = null;
let cache: AppSettings | undefined = undefined;

/**
 * Safely escape a PostgreSQL identifier (database name, table name, etc.).
 * Double quotes within identifiers are escaped by doubling them.
 * This follows PostgreSQL's identifier quoting rules.
 */
function escapeIdentifier(id: string): string {
    // Escape double quotes by doubling them, then wrap in double quotes
    const escaped = id.replace(/"/g, "\"\"");
    return `"${escaped}"`;
}

/**
 * Parse JSONB data that may be a string or object.
 * PostgreSQL's pg driver typically returns JSONB as objects, but configuration
 * can affect this behavior.
 */
function parseJsonbData(data: unknown): Record<string, unknown> {
    if (typeof data === "string") {
        return JSON.parse(data);
    }
    if (data != null && typeof data === "object") {
        return data as Record<string, unknown>;
    }
    throw new Error(`Expected JSON object or string, got ${typeof data}`);
}

/**
 * Migrate legacy theme value (string "light"/"dark") to boolean.
 * This handles backward compatibility with old YAML-based storage.
 */
function migrateThemeValue(value: unknown): unknown {
    if (typeof value === "string") {
        // Legacy format: "light" -> true, "dark" -> false
        if (value === "light") {
            return true;
        }
        if (value === "dark") {
            return false;
        }
    }
    // Already a boolean or invalid string (will be caught by validation)
    return value;
}

/**
 * Validate settings data loaded from database against the schema.
 * Handles backward compatibility with legacy data formats.
 * Returns validated settings or throws if data is invalid.
 */
function validateSettingsFromDb(data: unknown): AppSettings {
    // Parse JSONB data (may be string or object depending on pg configuration)
    const parsed = parseJsonbData(data);

    // Build a partial schema based on SETTINGS_SCHEMA metadata
    const entries = Object.entries(SETTINGS_SCHEMA);

    // Start with DEFAULT_SETTINGS as base
    const result: Partial<AppSettings> = { ...DEFAULT_SETTINGS };

    for (const [key, meta] of entries) {
        if (key in parsed) {
            let value = (parsed as Record<string, unknown>)[key];

            // Apply migrations before validation
            if (key === "theme") {
                value = migrateThemeValue(value);
            }

            // Type validation based on schema metadata
            switch (meta.type) {
            case "string":
                if (typeof value !== "string") {
                    throw new Error(`Setting "${key}" must be a string, got ${typeof value}`);
                }
                // Check enum constraints if present
                if (meta.options && !meta.options.includes(value as string)) {
                    throw new Error(`Setting "${key}" must be one of ${meta.options.join(", ")}, got "${value}"`);
                }
                break;
            case "number":
                if (typeof value !== "number") {
                    throw new Error(`Setting "${key}" must be a number, got ${typeof value}`);
                }
                // Range checks
                if (meta.min !== undefined && value < meta.min) {
                    throw new Error(`Setting "${key}" must be >= ${meta.min}, got ${value}`);
                }
                if (meta.max !== undefined && value > meta.max) {
                    throw new Error(`Setting "${key}" must be <= ${meta.max}, got ${value}`);
                }
                break;
            case "boolean":
                if (typeof value !== "boolean") {
                    throw new Error(`Setting "${key}" must be a boolean, got ${typeof value}`);
                }
                break;
            case "enum":
                // Enum types are stored as strings
                if (typeof value !== "string") {
                    throw new Error(`Setting "${key}" must be a string, got ${typeof value}`);
                }
                if (meta.options && !meta.options.includes(value as string)) {
                    throw new Error(`Setting "${key}" must be one of ${meta.options.join(", ")}, got "${value}"`);
                }
                break;
            default:
                // Unknown type, skip validation
                break;
            }

            result[key as keyof AppSettings] = value as unknown;
        }
    }

    return result as AppSettings;
}

/**
 * Initialize settings persistence by connecting to PostgreSQL.
 * Creates the target database if it doesn't exist (using template1 as bootstrap),
 * creates the app_settings table if needed, and seeds defaults on first run.
 */
export async function init(config: z.infer<typeof configSchema>): Promise<void> {
    const dbHost = config["db-host"];
    const dbPort = config["db-port"] as number;
    const dbName = config["db-name"];
    const dbUser = config["db-user"];
    const dbPassword = config["db-password"];

    // Bootstrap connection to template1 (always exists) so we can create the target DB if needed.
    // Use connection parameters object instead of string to handle special characters in passwords.
    // Add connection timeout to prevent indefinite hangs.
    const bootstrapPool = new Pool({
        host: dbHost,
        port: dbPort,
        user: dbUser,
        password: dbPassword,
        database: "template1",
        connectionTimeoutMillis: 5000, // 5 second timeout for initial connection
    });

    try {
        const check = await bootstrapPool.connect();
        try {
            const exists = await check.query(
                "SELECT 1 FROM pg_database WHERE datname = $1",
                [dbName]
            );
            if (exists.rows.length === 0) {
                // eslint-disable-next-line no-console
                console.warn(`[settingsStore] Database "${dbName}" does not exist — attempting to create it via template1...`);
                // CREATE DATABASE cannot run inside a transaction block in PostgreSQL.
                // A fresh connection from Pool.connect() has no active transaction, so we don't need ROLLBACK.
                // Safe identifier escaping for database name
                await check.query(`CREATE DATABASE ${escapeIdentifier(dbName)}`);
                // eslint-disable-next-line no-console
                console.info(`[settingsStore] Created database "${dbName}".`);
            } else {
                // eslint-disable-next-line no-console
                console.info(`[settingsStore] Database "${dbName}" already exists.`);
            }
        } finally {
            check.release();
        }

        // Await the pool end to ensure proper cleanup
        await bootstrapPool.end();
    } catch (err: unknown) {
        // Bootstrap failed — likely no CREATEDB privilege or connection issue.
        // Log a warning so the user knows; we'll still try to connect directly below
        // in case the database already exists but template1 access is restricted.
        // eslint-disable-next-line no-console
        console.warn(`[settingsStore] Could not bootstrap via template1: ${(ensureError(err)).message}. Will attempt direct connection.`);
    }

    pool = new Pool({
        host: dbHost,
        port: dbPort,
        user: dbUser,
        password: dbPassword,
        database: dbName,
        connectionTimeoutMillis: 5000, // 5 second timeout for initial connection
        statement_timeout: 30000,      // 30 second timeout for queries
    });

    // Test connection — fail fast if unreachable or DB still missing.
    const client = await pool.connect();
    try {
        await client.query("SELECT 1");

        // Ensure table exists.
        await client.query(`
            CREATE TABLE IF NOT EXISTS app_settings (
                id SERIAL PRIMARY KEY,
                data JSONB NOT NULL,
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `);

        // Load existing settings or seed defaults.
        const result = await client.query("SELECT data FROM app_settings WHERE id = 1");
        if (result.rows.length > 0 && result.rows[0].data) {
            // Validate and parse the JSONB data
            try {
                cache = validateSettingsFromDb(result.rows[0].data);
            } catch (validateErr: unknown) {
                // Invalid data in DB - log warning and seed with defaults
                // eslint-disable-next-line no-console
                console.warn(`[settingsStore] Invalid settings data in database: ${(ensureError(validateErr)).message}. Seeding with defaults.`);
                await client.query(
                    "INSERT INTO app_settings (id, data, updated_at) VALUES (1, $1, NOW())",
                    [JSON.stringify(DEFAULT_SETTINGS)]
                );
                cache = structuredClone(DEFAULT_SETTINGS);
            }
        } else {
            // Use ON CONFLICT to handle potential race conditions during concurrent init()
            await client.query(
                "INSERT INTO app_settings (id, data, updated_at) VALUES (1, $1, NOW()) ON CONFLICT (id) DO NOTHING",
                [JSON.stringify(DEFAULT_SETTINGS)]
            );
            cache = structuredClone(DEFAULT_SETTINGS);
        }
    } finally {
        client.release();
    }
}

/**
 * Get a deep copy of the current settings (never returns the internal cache).
 * Falls back to defaults if init() hasn't been called yet.
 */
export function getSettings(): AppSettings {
    if (!cache) {
        cache = structuredClone(DEFAULT_SETTINGS);
    }
    return structuredClone(cache);
}

/**
 * Partially update settings: merge `updates` into the existing cache, persist to PostgreSQL, and return the merged result.
 * If PostgreSQL is unavailable, updates are cached in memory and will be persisted when the database recovers.
 */
export async function patchSettings(updates: Record<string, unknown>): Promise<AppSettings> {
    // Initialize cache if not yet done (e.g., patchSettings called before init completes)
    if (!cache) {
        cache = structuredClone(DEFAULT_SETTINGS);
    }

    // Apply updates to build the new cache value
    const newCache: Partial<AppSettings> = { ...cache };
    for (const [key, value] of Object.entries(updates)) {
        if (key in DEFAULT_SETTINGS) {
            (newCache as Record<string, unknown>)[key] = value;
        }
    }

    if (!pool) {
        // No pool available - store in memory only
        cache = newCache as AppSettings;
        // eslint-disable-next-line no-console
        console.warn("[settingsStore] Patch attempted before init() — storing in memory only.");
        return structuredClone(newCache as AppSettings);
    }

    let client;
    try {
        client = await pool.connect();

        // Persist to DB first
        await client.query(
            `INSERT INTO app_settings (id, data, updated_at) VALUES (1, $1, NOW())
             ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
            [JSON.stringify(newCache)]
        );

        // Only update cache after successful persistence
        cache = newCache as AppSettings;
    } catch (err: unknown) {
        // Persistence failed — log warning but keep original cache unchanged.
        // eslint-disable-next-line no-console
        console.warn(`[settingsStore] Failed to persist settings: ${(ensureError(err)).message}. Changes discarded.`);
        throw err;
    } finally {
        if (client) {
            client.release();
        }
    }

    return structuredClone(cache);
}

/**
 * Close the PostgreSQL connection pool.
 */
export async function shutdown(): Promise<void> {
    if (pool) {
        await pool.end();
        pool = null;
    }
}
