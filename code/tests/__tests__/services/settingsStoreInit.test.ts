/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import type { z } from "zod";
import type { configSchema } from "../../../src/schemas/config";
import { DEFAULT_SETTINGS } from "../../../src/schemas/settings";

/**
 * In-memory stand-in for the single app_settings row. `null` means "no row".
 * Shared with the mocked pg driver below (mock-prefixed per Jest hoisting rules).
 */
let mockRow: unknown = null;

/**
 * When set, the pg_database probe reports "database does not exist" and the
 * CREATE DATABASE query rejects with this error (e.g. no CREATEDB privilege).
 */
let mockCreateDatabaseError: unknown = null;

/** Database name of every pool whose end() was called, in call order. */
const mockPoolEndCalls: string[] = [];

jest.mock("pg", () => {
    class FakePool {
        private readonly poolConfig: { database?: string };

        constructor(poolConfig: { database?: string }) {
            this.poolConfig = poolConfig;
        }

        async connect() {
            return {
                query: async (text: string, params?: unknown[]) => {
                    if (text.includes("pg_database")) {
                        // Report "does not exist" when the failure is armed,
                        // otherwise claim the database exists (skip CREATE DATABASE)
                        return { rows: mockCreateDatabaseError === null ? [{ 1: 1 }] : [] };
                    }
                    if (text.includes("CREATE DATABASE")) {
                        if (mockCreateDatabaseError !== null) {
                            throw mockCreateDatabaseError;
                        }
                        return { rows: [] };
                    }
                    if (text.includes("SELECT data FROM app_settings")) {
                        return { rows: mockRow === null ? [] : [{ data: mockRow }] };
                    }
                    if (text.includes("INSERT INTO app_settings")) {
                        // Emulate the table: the row is the stringified JSON payload
                        mockRow = JSON.parse(params?.[0] as string);
                        return { rows: [] };
                    }
                    // SELECT 1, CREATE TABLE, etc.
                    return { rows: [] };
                },
                release: () => {
                    // no-op
                },
            };
        }

        async end(): Promise<void> {
            mockPoolEndCalls.push(this.poolConfig.database ?? "?");
        }
    }
    return { Pool: FakePool };
});

const config = {
    "db-host": "localhost",
    "db-port": 5432,
    "db-name": "settings-test",
    "db-user": "app",
    "db-password": "secret",
} as unknown as z.infer<typeof configSchema>;

/**
 * Get a fresh settingsStore module instance (module-level pool/cache start
 * clean each time) against the mocked pg driver.
 */
function freshStore(): typeof import("../../../src/services/settingsStore") {
    jest.resetModules();
    return require("../../../src/services/settingsStore");
}

describe("init() with an existing persisted row", () => {
    beforeEach(() => {
        mockRow = null;
        mockCreateDatabaseError = null;
        mockPoolEndCalls.length = 0;
    });

    it("should repair a corrupt row with defaults and succeed (regression)", async () => {
        // Seed row id=1 with schema-invalid settings
        mockRow = { theme: "not-a-valid-theme" };
        const store = freshStore();

        // Previously this threw a duplicate-key error because the recovery
        // branch used a plain INSERT into an existing primary key.
        await expect(store.init(config)).resolves.toBeUndefined();

        // Row 1 now contains defaults
        expect(mockRow).toEqual(structuredClone(DEFAULT_SETTINGS));
        // In-memory cache matches
        expect(store.getSettings()).toEqual(structuredClone(DEFAULT_SETTINGS));
    });

    it("should allow a subsequent initialization to load the repaired row normally", async () => {
        mockRow = { theme: "not-a-valid-theme" };
        const store = freshStore();

        await store.init(config);

        // The repaired row now validates — a second init loads it cleanly
        await expect(store.init(config)).resolves.toBeUndefined();
        expect(store.getSettings()).toEqual(structuredClone(DEFAULT_SETTINGS));
    });

    it("should seed defaults when no row exists", async () => {
        mockRow = null;
        const store = freshStore();

        await expect(store.init(config)).resolves.toBeUndefined();

        expect(mockRow).toEqual(structuredClone(DEFAULT_SETTINGS));
        expect(store.getSettings()).toEqual(structuredClone(DEFAULT_SETTINGS));
    });

    it("should load valid persisted settings without rewriting the row", async () => {
        const custom = { ...structuredClone(DEFAULT_SETTINGS), theme: "dark" as const, time_range_hours: 72 };
        mockRow = custom;
        const store = freshStore();

        await expect(store.init(config)).resolves.toBeUndefined();

        expect(store.getSettings().theme).toBe("dark");
        expect(store.getSettings().time_range_hours).toBe(72);
        // The valid row was loaded, not replaced with defaults
        expect(mockRow).toEqual(custom);
        // Happy path: the bootstrap pool is closed exactly once
        expect(mockPoolEndCalls.filter(db => db === "template1")).toHaveLength(1);
    });

    it("should close the bootstrap pool even when CREATE DATABASE fails (regression)", async () => {
        // Realistic failure: template1 is reachable but the user lacks the
        // CREATEDB privilege, so CREATE DATABASE rejects.
        mockCreateDatabaseError = new Error('permission denied: "CREATE DATABASE"');
        const store = freshStore();

        // Bootstrap throws — init falls back to the direct connection and
        // must still succeed
        await expect(store.init(config)).resolves.toBeUndefined();

        // The bootstrap pool (template1) is still closed exactly once
        const bootstrapEnds = mockPoolEndCalls.filter(db => db === "template1");
        expect(bootstrapEnds).toHaveLength(1);
        // Settings were seeded through the main pool
        expect(store.getSettings()).toEqual(structuredClone(DEFAULT_SETTINGS));
    });
});
