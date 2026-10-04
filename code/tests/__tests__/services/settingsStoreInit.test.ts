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

/** When set, the settings persistence INSERT rejects with this error. */
let mockInsertError: unknown = null;

/** Artificial delay (ms) on the settings persistence INSERT. */
let mockInsertDelayMs = 0;

/** When set, connect() on the main (non-template1) pool rejects with this error. */
let mockConnectError: unknown = null;

/** When set, any query whose text contains this marker rejects with mockQueryError. */
let mockQueryErrorFor: string | null = null;
let mockQueryError: unknown = null;

/** Database name of every pool whose end() was called, in call order. */
const mockPoolEndCalls: string[] = [];

/** Database name of every pool whose client was released, in call order. */
const mockClientReleaseCalls: string[] = [];

jest.mock("pg", () => {
    class FakePool {
        private readonly poolConfig: { database?: string };

        constructor(poolConfig: { database?: string }) {
            this.poolConfig = poolConfig;
        }

        async connect() {
            if (mockConnectError !== null && this.poolConfig.database !== "template1") {
                throw mockConnectError;
            }
            return {
                query: async (text: string, params?: unknown[]) => {
                    if (mockQueryErrorFor !== null && text.includes(mockQueryErrorFor)) {
                        throw mockQueryError;
                    }
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
                        if (mockInsertDelayMs > 0) {
                            await new Promise(r => setTimeout(r, mockInsertDelayMs));
                        }
                        if (mockInsertError !== null) {
                            throw mockInsertError;
                        }
                        // Emulate the table: the row is the stringified JSON payload
                        mockRow = JSON.parse(params?.[0] as string);
                        return { rows: [] };
                    }
                    // SELECT 1, CREATE TABLE, etc.
                    return { rows: [] };
                },
                release: () => {
                    mockClientReleaseCalls.push(this.poolConfig.database ?? "?");
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

describe("init() failure cleanup", () => {
    beforeEach(() => {
        mockRow = null;
        mockCreateDatabaseError = null;
        mockInsertError = null;
        mockInsertDelayMs = 0;
        mockConnectError = null;
        mockQueryErrorFor = null;
        mockQueryError = null;
        mockPoolEndCalls.length = 0;
        mockClientReleaseCalls.length = 0;
    });

    afterEach(() => {
        mockConnectError = null;
        mockQueryErrorFor = null;
        mockQueryError = null;
    });

    it("should leave the service in writable in-memory mode when pool.connect() fails (regression)", async () => {
        const store = freshStore();
        mockConnectError = new Error("connect ECONNREFUSED");

        await expect(store.init(config)).rejects.toThrow("connect ECONNREFUSED");

        // The failed pool must not be exposed as usable persistence:
        // getSettings() returns defaults and patchSettings() operates in memory
        expect(store.getSettings()).toEqual(structuredClone(DEFAULT_SETTINGS));
        const patched = await store.patchSettings({ theme: "dark" });
        expect(patched.theme).toBe("dark");
        expect(store.getSettings().theme).toBe("dark");

        // The partially created pool was closed
        expect(mockPoolEndCalls).toContain("settings-test");
    });

    it("should release the client and close the pool when a query fails after connecting (regression)", async () => {
        const store = freshStore();
        mockQueryErrorFor = "CREATE TABLE";
        mockQueryError = new Error("permission denied: CREATE TABLE");

        await expect(store.init(config)).rejects.toThrow("permission denied: CREATE TABLE");

        // The client obtained from the main pool was released
        expect(mockClientReleaseCalls.filter(db => db === "settings-test")).toHaveLength(1);
        // The pool was closed
        expect(mockPoolEndCalls).toContain("settings-test");

        // The service still runs in in-memory mode
        expect(store.getSettings()).toEqual(structuredClone(DEFAULT_SETTINGS));
        const patched = await store.patchSettings({ theme: "dark" });
        expect(patched.theme).toBe("dark");
        expect(store.getSettings().theme).toBe("dark");
    });
});

describe("patchSettings() serialization", () => {
    beforeEach(() => {
        mockRow = null;
        mockCreateDatabaseError = null;
        mockInsertError = null;
        mockInsertDelayMs = 0;
        mockPoolEndCalls.length = 0;
    });

    afterEach(() => {
        mockInsertError = null;
        mockInsertDelayMs = 0;
    });

    it("should not lose updates when two patches race (regression)", async () => {
        const store = freshStore();
        await store.init(config);

        // Artificially slow persistence so both patches would interleave
        // under an unsynchronized read-modify-write
        mockInsertDelayMs = 50;

        const [a, b] = await Promise.all([
            store.patchSettings({ theme: "dark" }),
            store.patchSettings({ time_range_hours: 72 }),
        ]);

        // Each caller sees its own change committed
        expect(a.theme).toBe("dark");
        expect(b.time_range_hours).toBe(72);

        // Final state — in memory AND persisted — must contain BOTH changes
        const final = store.getSettings();
        expect(final.theme).toBe("dark");
        expect(final.time_range_hours).toBe(72);

        const persisted = JSON.parse(JSON.stringify(mockRow)) as Record<string, unknown>;
        expect(persisted["theme"]).toBe("dark");
        expect(persisted["time_range_hours"]).toBe(72);
    });

    it("should let a following patch proceed after a persistence failure (regression)", async () => {
        const store = freshStore();
        await store.init(config);

        // Request A fails during persistence
        mockInsertError = new Error("db connection lost");
        await expect(store.patchSettings({ theme: "dark" })).rejects.toThrow("db connection lost");
        // The failed update is discarded — the cache keeps the committed state
        expect(store.getSettings().theme).toBe(DEFAULT_SETTINGS.theme);

        // Request B must still execute — the serialization chain is not left
        // permanently blocked by A's failure
        mockInsertError = null;
        const b = await store.patchSettings({ time_range_hours: 72 });

        expect(b.time_range_hours).toBe(72);
        expect(b.theme).toBe(DEFAULT_SETTINGS.theme);
        const final = store.getSettings();
        expect(final.time_range_hours).toBe(72);
        expect(final.theme).toBe(DEFAULT_SETTINGS.theme);
    });
});
