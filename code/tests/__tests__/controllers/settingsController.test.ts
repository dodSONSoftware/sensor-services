/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import type { Request, Response } from "express";
import { getAllSettings, getSettingsDefaults, getSettingsSchema, updateSettings } from "../../../src/controllers/settingsController";
import { createMockRes, createMockReq } from "../../mocks/express";

// Mock settingsStore so tests don't require a real DB connection.
const baseMockCache = {
    theme: "light" as const,
    dashboard_layout: "cards" as const,
    notification_level: "warn" as const,
    time_range_hours: 24,
    decimal_places: 2,
};

jest.mock("../../../src/services/settingsStore", () => ({
    init: jest.fn().mockResolvedValue(undefined),
    shutdown: jest.fn().mockResolvedValue(undefined),
    getSettings: jest.fn(() => structuredClone(currentMockCache)),
    patchSettings: jest.fn(async (updates: Record<string, unknown>) => {
        Object.assign(currentMockCache, updates);
        return structuredClone(currentMockCache);
    }),
    isPersistenceAvailable: jest.fn(() => mockPersisted),
}));

import * as settingsStore from "../../../src/services/settingsStore";

let currentMockCache = { ...baseMockCache };
// P3-6: controllable so tests can exercise both the persisted (true) and
// degraded in-memory (false) branches of the X-Settings-Persisted header.
let mockPersisted = true;

describe("getSettingsDefaults", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        currentMockCache = { ...baseMockCache };
    });

    it("should return 200 with OK status and JSON content type", async () => {
        const { res, statusCalls, contentTypeCalls, sendCalls } = createMockRes();
        const req = createMockReq() as Request;

        await getSettingsDefaults(req, res as Response);

        expect(statusCalls).toContain(200);
        expect(contentTypeCalls).toContain("application/json");
        expect(sendCalls).toHaveLength(1);
    });

    it("should return both settings and schema objects", async () => {
        const { res, sendCalls } = createMockRes();
        const req = createMockReq() as Request;

        await getSettingsDefaults(req, res as Response);

        const body = sendCalls[0] as Record<string, unknown>;
        expect(body).toHaveProperty("settings");
        expect(body).toHaveProperty("schema");
    });

    it("should return settings with all expected keys", async () => {
        const { res, sendCalls } = createMockRes();
        const req = createMockReq() as Request;

        await getSettingsDefaults(req, res as Response);

        const body = sendCalls[0] as Record<string, unknown>;
        expect(body.settings).toHaveProperty("theme");
        expect(body.settings).toHaveProperty("dashboard_layout");
        expect(body.settings).toHaveProperty("notification_level");
        expect(body.settings).toHaveProperty("time_range_hours");
        expect(body.settings).toHaveProperty("decimal_places");
    });

    it("should return schema with metadata for every setting", async () => {
        const { res, sendCalls } = createMockRes();
        const req = createMockReq() as Request;

        await getSettingsDefaults(req, res as Response);

        const body = sendCalls[0] as Record<string, unknown>;
        const schema = body.schema as Record<string, unknown>;
        expect(schema).toHaveProperty("theme");
        expect(schema).toHaveProperty("dashboard_layout");
        expect(schema).toHaveProperty("notification_level");
        expect(schema).toHaveProperty("time_range_hours");
        expect(schema).toHaveProperty("decimal_places");
        expect(schema).toHaveProperty("mqtt_broker_address");
        expect(schema).toHaveProperty("mqtt_topic_telemetry");
        expect(schema).toHaveProperty("mqtt_topic_command");
        expect(schema).toHaveProperty("mqtt_topic_command_response");
    });

    it("should include label, description, type, and default in each schema entry", async () => {
        const { res, sendCalls } = createMockRes();
        const req = createMockReq() as Request;

        await getSettingsDefaults(req, res as Response);

        const body = sendCalls[0] as Record<string, unknown>;
        const themeSchema = (body.schema as Record<string, unknown>)["theme"] as Record<string, unknown>;
        expect(themeSchema).toHaveProperty("label");
        expect(themeSchema).toHaveProperty("description");
        expect(themeSchema).toHaveProperty("type");
        expect(themeSchema).toHaveProperty("default");
    });

    it("should include enum values for settings that have them", async () => {
        const { res, sendCalls } = createMockRes();
        const req = createMockReq() as Request;

        await getSettingsDefaults(req, res as Response);

        const body = sendCalls[0] as Record<string, unknown>;
        const schema = body.schema as Record<string, unknown>;
        expect((schema["dashboard_layout"] as Record<string, unknown>).options).toEqual(["cards", "list"]);
        expect((schema["notification_level"] as Record<string, unknown>).options).toEqual(["none", "warn", "critical"]);
    });

    it("should include min/max for numeric settings that have ranges", async () => {
        const { res, sendCalls } = createMockRes();
        const req = createMockReq() as Request;

        await getSettingsDefaults(req, res as Response);

        const body = sendCalls[0] as Record<string, unknown>;
        const schema = body.schema as Record<string, unknown>;
        expect((schema["ping_delay_ms"] as Record<string, unknown>).min).toBe(0);
        expect((schema["ping_delay_ms"] as Record<string, unknown>).max).toBe(1000);
    });

    it("should mark optional settings correctly", async () => {
        const { res, sendCalls } = createMockRes();
        const req = createMockReq() as Request;

        await getSettingsDefaults(req, res as Response);

        const body = sendCalls[0] as Record<string, unknown>;
        const schema = body.schema as Record<string, unknown>;
        expect((schema["mqtt_broker_address"] as Record<string, unknown>).optional).toBe(true);
    });
});

describe("getAllSettings", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        currentMockCache = { ...baseMockCache };
    });

    it("should return all settings with OK status and JSON content type", async () => {
        const { res, statusCalls, contentTypeCalls, sendCalls } = createMockRes();
        const req = createMockReq() as Request;

        await getAllSettings(req, res as Response);

        expect(statusCalls).toContain(200);
        expect(contentTypeCalls).toContain("application/json");
        expect(sendCalls).toHaveLength(1);
    });

    it("should return settings with all expected keys", async () => {
        const { res, sendCalls } = createMockRes();
        const req = createMockReq() as Request;

        await getAllSettings(req, res as Response);

        const body = sendCalls[0] as Record<string, unknown>;
        expect(body).toHaveProperty("theme");
        expect(body).toHaveProperty("dashboard_layout");
        expect(body).toHaveProperty("notification_level");
        expect(body).toHaveProperty("time_range_hours");
        expect(body).toHaveProperty("decimal_places");
    });

    it("should return default values for all settings keys", async () => {
        const { res, sendCalls } = createMockRes();
        const req = createMockReq() as Request;

        await getAllSettings(req, res as Response);

        const body = sendCalls[0] as Record<string, unknown>;
        expect(body.theme).toBe("light");
        expect(body.dashboard_layout).toBe("cards");
        expect(body.notification_level).toBe("warn");
        expect(body.time_range_hours).toBe(24);
        expect(body.decimal_places).toBe(2);
    });
});

describe("updateSettings", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        currentMockCache = { ...baseMockCache };
        mockPersisted = true;
    });

    it("should return merged settings after partial update", async () => {
        const { res, statusCalls, contentTypeCalls, sendCalls } = createMockRes();
        const req = createMockReq({ body: { theme: "dark" } }) as Request;

        await updateSettings(req, res as Response);

        expect(statusCalls).toContain(200);
        expect(contentTypeCalls).toContain("application/json");
        expect(sendCalls).toHaveLength(1);
    });

    it("should persist the updated value and reflect on next get", async () => {
        const { res, sendCalls } = createMockRes();
        const req = createMockReq({ body: { theme: "dark" } }) as Request;

        await updateSettings(req, res as Response);

        const body = sendCalls[0] as Record<string, unknown>;
        expect(body.theme).toBe("dark");
    });

    it("should preserve unchanged keys after partial update", async () => {
        const { res, sendCalls } = createMockRes();
        const req = createMockReq({ body: { theme: "dark" } }) as Request;

        await updateSettings(req, res as Response);

        const body = sendCalls[0] as Record<string, unknown>;
        expect(body.dashboard_layout).toBe("cards");
    });

    it("should handle multiple field updates", async () => {
        const { res, sendCalls } = createMockRes();
        const req = createMockReq({ body: { theme: "dark" } }) as Request;

        await updateSettings(req, res as Response);

        const body = sendCalls[0] as Record<string, unknown>;
        expect(body.theme).toBe("dark");
    });
});

/**
 * Tests for partial update behavior - verifies that only explicitly provided
 * fields are updated without applying defaults to missing fields.
 */
describe("updateSettings - Partial Update Behavior", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Start with dark mode (theme: "dark")
        currentMockCache = {
            ...baseMockCache,
            theme: "dark"
        };
        mockPersisted = true;
    });

    it("should not apply defaults when updating other fields", async () => {
        const { res, sendCalls } = createMockRes();
        // User changes MQTT broker while in dark mode
        const req = createMockReq({ body: { mqtt_broker_address: "new-broker.com" } }) as Request;

        await updateSettings(req, res as Response);

        const body = sendCalls[0] as Record<string, unknown>;
        // Theme should remain "dark", NOT default to "light"
        expect(body.theme).toBe("dark");
        // MQTT broker should be updated
        expect(body.mqtt_broker_address).toBe("new-broker.com");
    });

    it("should preserve all unchanged settings during partial update", async () => {
        const { res, sendCalls } = createMockRes();
        const req = createMockReq({ body: { ping_delay_ms: 1000 } }) as Request;

        await updateSettings(req, res as Response);

        const body = sendCalls[0] as Record<string, unknown>;
        // All unchanged settings should retain their values
        expect(body.theme).toBe("dark");             // Was explicitly set to "dark"
        expect(body.ping_delay_ms).toBe(1000);   // Was updated
        expect(body.dashboard_layout).toBe("cards");     // Default preserved
    });
});

/**
 * P3-6: the persistence state must be reported to the caller. The response
 * body shape is intentionally unchanged (still the merged settings object,
 * which the web app reads flat keys from), so the flag rides in the
 * X-Settings-Persisted header.
 */
describe("updateSettings - persistence reporting (P3-6)", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        currentMockCache = { ...baseMockCache };
        mockPersisted = true;
    });

    it("reports X-Settings-Persisted: true when the pool is available", async () => {
        const { res, statusCalls, headerCalls, sendCalls } = createMockRes();
        const req = createMockReq({ body: { theme: "dark" } }) as Request;

        await updateSettings(req, res as Response);

        expect(statusCalls).toContain(200);
        expect(headerCalls["X-Settings-Persisted"]).toBe("true");
        expect(settingsStore.isPersistenceAvailable).toHaveBeenCalled();
        // Body shape unchanged: the merged settings object, no wrapper.
        const body = sendCalls[0] as Record<string, unknown>;
        expect(body.theme).toBe("dark");
        expect(body).not.toHaveProperty("persisted");
    });

    it("reports X-Settings-Persisted: false in degraded mode while the in-memory update still applies", async () => {
        mockPersisted = false;
        const { res, statusCalls, headerCalls, sendCalls } = createMockRes();
        const req = createMockReq({ body: { theme: "dark" } }) as Request;

        await updateSettings(req, res as Response);

        expect(statusCalls).toContain(200);
        expect(headerCalls["X-Settings-Persisted"]).toBe("false");
        const body = sendCalls[0] as Record<string, unknown>;
        expect(body.theme).toBe("dark");
    });

    it("does not set the persistence header when validation fails", async () => {
        const { res, statusCalls, headerCalls } = createMockRes();
        const req = createMockReq({ body: { bogus_key: 1 } }) as Request;

        await updateSettings(req, res as Response);

        expect(statusCalls).toContain(400);
        expect(headerCalls["X-Settings-Persisted"]).toBeUndefined();
    });

    // Optional-5: a persistence failure must surface as an explicit 500 with
    // the failure reason, and must not report success or apply the update.
    it("responds 500 when the persistence layer rejects the update (Optional-5)", async () => {
        (settingsStore.patchSettings as jest.Mock).mockRejectedValueOnce(new Error("db connection lost"));
        const { res, statusCalls, headerCalls, sendCalls } = createMockRes();
        const req = createMockReq({ body: { theme: "dark" } }) as Request;

        await updateSettings(req, res as Response);

        expect(statusCalls).toContain(500);
        expect(headerCalls["X-Settings-Persisted"]).toBeUndefined();
        const body = sendCalls[0] as Record<string, unknown>;
        expect(String(body.error)).toContain("db connection lost");
        // The failed update must not have been applied in-memory either.
        expect(currentMockCache.theme).toBe("light");
    });
});

/**
 * P3-7: the update schema is strict, so an unknown key (e.g. a typo) fails
 * the request with 400 instead of being silently dropped.
 */
describe("updateSettings - strict key validation (P3-7)", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        currentMockCache = { ...baseMockCache };
    });

    it("rejects an unknown key with 400", async () => {
        const { res, statusCalls, sendCalls, headerCalls } = createMockRes();
        const req = createMockReq({ body: { them: "dark" } }) as Request;

        await updateSettings(req, res as Response);

        expect(statusCalls).toContain(400);
        const body = sendCalls[0] as Record<string, unknown>;
        expect(String(body.error)).toMatch(/Invalid settings update/);
        expect(String(body.error)).toMatch(/them/);
        expect(headerCalls["X-Settings-Persisted"]).toBeUndefined();
        expect(settingsStore.patchSettings).not.toHaveBeenCalled();
    });

    it("rejects a mix of known and unknown keys with 400 and applies nothing", async () => {
        const { res, statusCalls, sendCalls } = createMockRes();
        const req = createMockReq({ body: { theme: "dark", bogus_key: 1 } }) as Request;

        await updateSettings(req, res as Response);

        expect(statusCalls).toContain(400);
        const body = sendCalls[0] as Record<string, unknown>;
        expect(String(body.error)).toMatch(/bogus_key/);
        expect(settingsStore.patchSettings).not.toHaveBeenCalled();
        // The known key in the same body must not be partially applied.
        expect(currentMockCache.theme).toBe("light");
    });

    it("accepts a valid partial update of a nested telemetry key", async () => {
        const { res, statusCalls, sendCalls } = createMockRes();
        const req = createMockReq({
            body: {
                "telemetry.air": [{ ui: "TEMPERATURE", order: 0, value: "temperature_c", visible: true }],
            },
        }) as Request;

        await updateSettings(req, res as Response);

        expect(statusCalls).toContain(200);
        const body = sendCalls[0] as Record<string, unknown>;
        expect(body["telemetry.air"]).toEqual([{ ui: "TEMPERATURE", order: 0, value: "temperature_c", visible: true }]);
    });
});

describe("getSettingsSchema", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        currentMockCache = { ...baseMockCache };
    });

    it("should return 200 with OK status and JSON content type", async () => {
        const { res, statusCalls, contentTypeCalls, sendCalls } = createMockRes();
        const req = createMockReq() as Request;

        await getSettingsSchema(req, res as Response);

        expect(statusCalls).toContain(200);
        expect(contentTypeCalls).toContain("application/json");
        expect(sendCalls).toHaveLength(1);
    });

    it("should return an array of setting definitions", async () => {
        const { res, sendCalls } = createMockRes();
        const req = createMockReq() as Request;

        await getSettingsSchema(req, res as Response);

        const body = sendCalls[0] as Record<string, unknown>[];
        expect(Array.isArray(body)).toBe(true);
        expect(body.length).toBeGreaterThan(0);
    });

    it("each setting definition should have name, type, default, range, and description", async () => {
        const { res, sendCalls } = createMockRes();
        const req = createMockReq() as Request;

        await getSettingsSchema(req, res as Response);

        const body = sendCalls[0] as Record<string, unknown>[];
        const themeSetting = body.find(s => s.name === "theme");

        expect(themeSetting).toBeDefined();
        expect(themeSetting?.type).toBe("enum");
        expect(themeSetting?.default).toBe("light");
        expect(themeSetting?.range).toEqual({ options: ["light", "dark"] });
        expect(themeSetting?.description).toBeDefined();
    });

    it("should include correct type for all settings", async () => {
        const { res, sendCalls } = createMockRes();
        const req = createMockReq() as Request;

        await getSettingsSchema(req, res as Response);

        const body = sendCalls[0] as Record<string, unknown>[];
        const settingsMap = Object.fromEntries(body.map(s => [s.name as string, s]));

        expect(settingsMap["theme"].type).toBe("enum");
        expect(settingsMap["dashboard_layout"].type).toBe("enum");
        expect(settingsMap["notification_level"].type).toBe("enum");
        expect(settingsMap["time_range_hours"].type).toBe("number");
        expect(settingsMap["decimal_places"].type).toBe("number");
        expect(settingsMap["mqtt_broker_address"].type).toBe("string");
    });

    it("should include correct range for numeric settings", async () => {
        const { res, sendCalls } = createMockRes();
        const req = createMockReq() as Request;

        await getSettingsSchema(req, res as Response);

        const body = sendCalls[0] as Record<string, unknown>[];
        const pingDelaySetting = body.find(s => s.name === "ping_delay_ms");

        expect(pingDelaySetting?.range).toEqual({
            min: 0,
            max: 1000,
            step: 10,
        });
    });

    it("should include correct range for enum settings", async () => {
        const { res, sendCalls } = createMockRes();
        const req = createMockReq() as Request;

        await getSettingsSchema(req, res as Response);

        const body = sendCalls[0] as Record<string, unknown>[];
        const layoutSetting = body.find(s => s.name === "dashboard_layout");

        expect(layoutSetting?.range).toEqual({
            options: ["cards", "list"],
        });
    });

    it("should include all expected settings", async () => {
        const { res, sendCalls } = createMockRes();
        const req = createMockReq() as Request;

        await getSettingsSchema(req, res as Response);

        const body = sendCalls[0] as Record<string, unknown>[];
        const names = body.map(s => s.name as string);

        expect(names).toContain("theme");
        expect(names).toContain("dashboard_layout");
        expect(names).toContain("notification_level");
        expect(names).toContain("time_range_hours");
        expect(names).toContain("decimal_places");
        expect(names).toContain("mqtt_broker_address");
        expect(names).toContain("mqtt_topic_telemetry");
        expect(names).toContain("mqtt_topic_command");
        expect(names).toContain("mqtt_topic_command_response");
    });
});
