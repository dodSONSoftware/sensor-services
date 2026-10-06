/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import { Pool, type PoolClient } from "pg";
import type { z } from "zod";
import type { configSchema } from "../schemas/config";
import { appSettingsSchema, DEFAULT_SETTINGS, SETTINGS_SCHEMA, type AppSettings } from "../schemas/settings";
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
 * Migrate legacy theme value (boolean) to string enum.
 * This handles backward compatibility with old data where theme was stored as boolean.
 * true -> "light", false -> "dark"
 */
function migrateThemeValue(value: unknown): unknown {
    if (typeof value === "boolean") {
        // Legacy format: true -> "light", false -> "dark"
        return value ? "light" : "dark";
    }
    // Already a string or invalid (will be caught by validation)
    return value;
}

/**
 * Resolve a setting key in a parsed settings object. Keys may be flat
 * (e.g. "theme") or nested paths (e.g. "telemetry.air" → parsed.telemetry.air).
 * Returns undefined when the key is absent.
 */
function getSettingValue(parsed: Record<string, unknown>, key: string): unknown {
    if (key in parsed) {
        return parsed[key];
    }
    if (key.includes(".")) {
        let current: unknown = parsed;
        for (const part of key.split(".")) {
            if (current == null || typeof current !== "object" || !(part in (current as Record<string, unknown>))) {
                return undefined;
            }
            current = (current as Record<string, unknown>)[part];
        }
        return current;
    }
    return undefined;
}

/**
 * Assign a value at a setting key, creating intermediate objects as needed.
 * Nested keys (e.g. "telemetry.air") are written to result.telemetry.air.
 */
function setSettingValue(result: Record<string, unknown>, key: string, value: unknown): void {
    const dotIndex = key.indexOf(".");
    if (dotIndex > 0) {
        const parentKey = key.substring(0, dotIndex);
        const childKey = key.substring(dotIndex + 1);
        if (result[parentKey] == null || typeof result[parentKey] !== "object") {
            result[parentKey] = {};
        }
        (result[parentKey] as Record<string, unknown>)[childKey] = value;
    } else {
        result[key] = value;
    }
}

/**
 * Validate settings data loaded from database against the schema.
 * Returns validated settings or throws if data is invalid.
 * Exported for testing.
 */
export function validateSettingsFromDb(data: unknown): AppSettings {
    // Parse JSONB data (may be string or object depending on pg configuration)
    const parsed = parseJsonbData(data);

    // Start with a deep clone of DEFAULT_SETTINGS as the base — a shallow
    // spread would let nested assignments below mutate the shared defaults.
    const result: Record<string, unknown> = structuredClone(DEFAULT_SETTINGS);

    for (const [key, meta] of Object.entries(SETTINGS_SCHEMA)) {
        // Resolve the key in the persisted data: flat key first, then the
        // nested path (e.g. "telemetry.air"), then the legacy flat aliases
        // (e.g. "air_telemetry").
        let value = getSettingValue(parsed, key);
        if (value === undefined && key.startsWith("telemetry.")) {
            value = getSettingValue(parsed, `${key.substring("telemetry.".length)}_telemetry`);
        }

        // Key not present in the persisted data — the base already holds the default
        if (value === undefined) {
            continue;
        }

        // Apply migrations before validation
        if (key === "theme") {
            value = migrateThemeValue(value);
        }

        // Type validation and assignment based on schema metadata
        switch (meta.type) {
        case "string": {
            if (typeof value !== "string") {
                throw new Error(`Setting "${key}" must be a string, got ${typeof value}`);
            }
            // Check enum constraints if present
            if (meta.options && !meta.options.includes(value)) {
                throw new Error(`Setting "${key}" must be one of ${meta.options.join(", ")}, got "${value}"`);
            }
            setSettingValue(result, key, value);
            break;
        }
        case "number": {
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
            setSettingValue(result, key, value);
            break;
        }
        case "enum": {
            // Enum types are stored as strings
            if (typeof value !== "string") {
                throw new Error(`Setting "${key}" must be a string, got ${typeof value}`);
            }
            if (meta.options && !meta.options.includes(value)) {
                throw new Error(`Setting "${key}" must be one of ${meta.options.join(", ")}, got "${value}"`);
            }
            setSettingValue(result, key, value);
            break;
        }
        case "array": {
            // Array types (like telemetry settings) are stored as JSON
            if (!Array.isArray(value)) {
                throw new Error(`Setting "${key}" must be an array, got ${typeof value}`);
            }

            // For telemetry arrays, start with the persisted values, then add
            // any default items added since, so existing installs pick up
            // newly added default fields.
            const telemetryKey = key.startsWith("telemetry.") ? key.substring("telemetry.".length) : undefined;
            if (telemetryKey !== undefined && telemetryKey in DEFAULT_SETTINGS.telemetry) {
                const defaults = (DEFAULT_SETTINGS.telemetry as Record<string, Array<{ value: string }>>)[telemetryKey];
                const dbValue = value as Array<{ value: string }>;
                const merged = [...dbValue];
                for (const defaultItem of defaults) {
                    if (!merged.some(item => item.value === defaultItem.value)) {
                        merged.push(defaultItem);
                    }
                }
                setSettingValue(result, key, merged);
            } else {
                setSettingValue(result, key, value);
            }
            break;
        }
        default:
            // Unknown type, skip this entry
            continue;
        }
    }

    // Validate the reconstructed object against the canonical schema — this
    // strips stray top-level keys (literal "telemetry.air", legacy aliases)
    // and fills in any missing defaults.
    return appSettingsSchema.parse(result);
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
    } catch (err: unknown) {
        // Bootstrap failed — likely no CREATEDB privilege or connection issue.
        // Log a warning so the user knows; we'll still try to connect directly below
        // in case the database already exists but template1 access is restricted.
        // eslint-disable-next-line no-console
        console.warn(`[settingsStore] Could not bootstrap via template1: ${(ensureError(err)).message}. Will attempt direct connection.`);
    } finally {
        // Close the bootstrap pool on every path — including when connect,
        // the existence query, or CREATE DATABASE threw — so a failed
        // bootstrap never leaks its connections.
        await bootstrapPool.end();
    }

    // Build the pool locally and only assign it to module-level state after
    // initialization has fully succeeded — `pool !== null` must mean settings
    // persistence is initialized and usable. On failure the local pool is
    // closed and `pool` stays null, so the service runs in real in-memory
    // mode (see patchSettings/getSettings).
    const newPool = new Pool({
        host: dbHost,
        port: dbPort,
        user: dbUser,
        password: dbPassword,
        database: dbName,
        connectionTimeoutMillis: 5000, // 5 second timeout for initial connection
        statement_timeout: 30000,      // 30 second timeout for queries
    });

    let client: PoolClient | null = null;
    try {
        // Test connection — fail fast if unreachable or DB still missing.
        client = await newPool.connect();
        try {
            await runInitQueries(client);
        } finally {
            // Always release the client, even when initialization failed after
            // a connection was obtained.
            client.release();
            client = null;
        }
        // Initialization succeeded — expose the pool.
        pool = newPool;
    } catch (err: unknown) {
        // Close the partially created pool so no connections are leaked and
        // later settings operations do not keep hitting a failed database.
        try {
            await newPool.end();
        } catch (endErr: unknown) {
            // eslint-disable-next-line no-console
            console.warn(`[settingsStore] Failed to close pool after initialization failure: ${(ensureError(endErr)).message}`);
        }
        throw err;
    }
}

/**
 * Run the initialization queries against a connected client: verify the
 * connection, ensure the table exists, and load or seed the settings row.
 */
async function runInitQueries(client: PoolClient): Promise<void> {
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
            // Invalid data in DB - log warning and repair the row with defaults.
            // Use UPSERT: the row already exists (that's how we got here), so a
            // plain INSERT would fail on the primary key and leave the corrupt
            // row in place.
            // eslint-disable-next-line no-console
            console.warn(`[settingsStore] Invalid settings data in database: ${(ensureError(validateErr)).message}. Seeding with defaults.`);
            await client.query(
                `INSERT INTO app_settings (id, data, updated_at) VALUES (1, $1, NOW())
                 ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
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
 * Whether settings persistence (PostgreSQL) is currently initialized and
 * usable. `false` means the store is running in real in-memory (degraded)
 * mode: updates are applied to the in-memory cache but NOT written to the
 * database, so they will not survive a restart. The settings controller uses
 * this to report the X-Settings-Persisted flag on update responses (P3-6) so a
 * caller is never left believing a degraded (in-memory-only) update is durable.
 */
export function isPersistenceAvailable(): boolean {
    return pool !== null;
}

/**
 * Serialize settings updates within this process. patchSettings performs a
 * read-modify-write on the shared in-memory cache, and persistence crosses
 * async boundaries — without serialization, two concurrent patches can clone
 * the same committed state, persist different fields independently, and
 * overwrite one another (both callers report success, one update is lost).
 */
let settingsUpdateQueue: Promise<unknown> = Promise.resolve();

/**
 * Partially update settings: merge `updates` into the existing cache, persist to PostgreSQL, and return the merged result.
 *
 * Degraded mode (PostgreSQL was never initialized, so no pool exists): the
 * update is RETAINED in the in-memory cache but NON-DURABLE — it resolves
 * normally with the merged result, and the caller reports
 * X-Settings-Persisted: false. It is not queued for later persistence; it
 * would be lost on restart.
 *
 * Transient failure (a pool exists but the persistence query fails): the
 * update is DISCARDED (the cache is left unchanged) and the error is
 * rethrown so the caller can report 500.
 *
 * Updates are serialized: each patch observes the latest committed in-memory
 * state. A failed update rethrows to its own caller without breaking the
 * queue for subsequent updates.
 */
export function patchSettings(updates: Record<string, unknown>): Promise<AppSettings> {
    const operation = settingsUpdateQueue.then(() => doPatchSettings(updates));

    // A failed update must not permanently break the chain — swallow the
    // rejection for the queue while each caller still receives its own result.
    settingsUpdateQueue = operation.catch(() => undefined);

    return operation;
}

async function doPatchSettings(updates: Record<string, unknown>): Promise<AppSettings> {
    // Initialize cache if not yet done (e.g., patchSettings called before init completes)
    if (!cache) {
        cache = structuredClone(DEFAULT_SETTINGS);
    }

    // Apply updates to build the new cache value
    // Use type assertion to allow dynamic key access for both flat and nested keys
    const newCache = structuredClone(cache) as Record<string, unknown>;

    for (const [key, value] of Object.entries(updates)) {
        // Check if this is a valid setting key (flat or nested)
        if (isSettingKeyValid(key)) {
            // Handle nested key assignment (e.g., "telemetry.air")
            const dotIndex = key.indexOf(".");
            if (dotIndex > 0) {
                const parentKey = key.substring(0, dotIndex);
                const childKey = key.substring(dotIndex + 1);

                // Ensure parent object exists
                if (newCache[parentKey] == null || typeof newCache[parentKey] !== "object") {
                    newCache[parentKey] = {};
                }

                // Assign to nested path
                ((newCache[parentKey] as Record<string, unknown>))[childKey] = value;
            } else {
                newCache[key] = value;
            }
        }
    }

    // Helper function to check if a key is valid in DEFAULT_SETTINGS
    function isSettingKeyValid(key: string): boolean {
        // Direct match for flat keys
        if (key in DEFAULT_SETTINGS) {
            return true;
        }
        // Handle dot-notation nested keys like "telemetry.air"
        const dotIndex = key.indexOf(".");
        if (dotIndex > 0) {
            const parentKey = key.substring(0, dotIndex);
            const childKey = key.substring(dotIndex + 1);
            const parentValue = (DEFAULT_SETTINGS as Record<string, unknown>)[parentKey];
            // Check if parent is an object and child key exists within it
            if (parentValue != null && typeof parentValue === "object" && !Array.isArray(parentValue)) {
                return childKey in parentValue;
            }
        }
        return false;
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
