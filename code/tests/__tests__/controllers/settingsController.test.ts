/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import type { Request, Response } from "express";
import { getAllSettings, getSettingsDefaults, updateSettings } from "../../../src/controllers/settingsController";
import { createMockRes, createMockReq } from "../../mocks/express";

// Mock settingsStore so tests don't require a real DB connection.
const baseMockCache = {
    theme: true,
    refresh_interval_sec: 5,
    dashboard_layout: "grid" as const,
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
}));

import * as settingsStore from "../../../src/services/settingsStore";

let currentMockCache = { ...baseMockCache };

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
        expect(body.settings).toHaveProperty("refresh_interval_sec");
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
        expect(schema).toHaveProperty("refresh_interval_sec");
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
        expect((schema["refresh_interval_sec"] as Record<string, unknown>).min).toBe(1);
        expect((schema["refresh_interval_sec"] as Record<string, unknown>).max).toBe(60);
    });

    it("should mark optional settings correctly", async () => {
        const { res, sendCalls } = createMockRes();
        const req = createMockReq() as Request;

        await getSettingsDefaults(req, res as Response);

        const body = sendCalls[0] as Record<string, unknown>;
        const schema = body.schema as Record<string, unknown>;
        expect((schema["mqtt_broker_address"] as Record<string, unknown>).optional).toBe(true);
        expect((schema["refresh_interval_sec"] as Record<string, unknown>).optional).toBeFalsy();
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
        expect(body).toHaveProperty("refresh_interval_sec");
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
        expect(body.theme).toBe(true);
        expect(body.refresh_interval_sec).toBe(5);
        expect(body.dashboard_layout).toBe("grid");
        expect(body.notification_level).toBe("warn");
        expect(body.time_range_hours).toBe(24);
        expect(body.decimal_places).toBe(2);
    });
});

describe("updateSettings", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        currentMockCache = { ...baseMockCache };
    });

    it("should return merged settings after partial update", async () => {
        const { res, statusCalls, contentTypeCalls, sendCalls } = createMockRes();
        const req = createMockReq({ body: { theme: false } }) as Request;

        await updateSettings(req, res as Response);

        expect(statusCalls).toContain(200);
        expect(contentTypeCalls).toContain("application/json");
        expect(sendCalls).toHaveLength(1);
    });

    it("should persist the updated value and reflect on next get", async () => {
        const { res, sendCalls } = createMockRes();
        const req = createMockReq({ body: { theme: false } }) as Request;

        await updateSettings(req, res as Response);

        const body = sendCalls[0] as Record<string, unknown>;
        expect(body.theme).toBe(false);
    });

    it("should preserve unchanged keys after partial update", async () => {
        const { res, sendCalls } = createMockRes();
        const req = createMockReq({ body: { theme: false } }) as Request;

        await updateSettings(req, res as Response);

        const body = sendCalls[0] as Record<string, unknown>;
        expect(body.refresh_interval_sec).toBe(5);
    });

    it("should handle multiple field updates", async () => {
        const { res, sendCalls } = createMockRes();
        const req = createMockReq({ body: { theme: false } }) as Request;

        await updateSettings(req, res as Response);

        const body = sendCalls[0] as Record<string, unknown>;
        expect(body.theme).toBe(false);
    });
});

/**
 * Tests for partial update behavior - verifies that only explicitly provided
 * fields are updated without applying defaults to missing fields.
 */
describe("updateSettings - Partial Update Behavior", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Start with dark mode (theme: false)
        currentMockCache = {
            ...baseMockCache,
            theme: false
        };
    });

    it("should not apply defaults when updating other fields", async () => {
        const { res, sendCalls } = createMockRes();
        // User changes MQTT broker while in dark mode
        const req = createMockReq({ body: { mqtt_broker_address: "new-broker.com" } }) as Request;

        await updateSettings(req, res as Response);

        const body = sendCalls[0] as Record<string, unknown>;
        // Theme should remain false (dark mode), NOT default to true
        expect(body.theme).toBe(false);
        // MQTT broker should be updated
        expect(body.mqtt_broker_address).toBe("new-broker.com");
    });

    it("should preserve all unchanged settings during partial update", async () => {
        const { res, sendCalls } = createMockRes();
        const req = createMockReq({ body: { refresh_interval_sec: 10 } }) as Request;

        await updateSettings(req, res as Response);

        const body = sendCalls[0] as Record<string, unknown>;
        // All unchanged settings should retain their values
        expect(body.theme).toBe(false);           // Was explicitly set to false
        expect(body.refresh_interval_sec).toBe(10);  // Was updated
        expect(body.dashboard_layout).toBe("grid");      // Default preserved
    });
});
