/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import type { Request, Response } from "express";
import { getAllSettings, getSettingsDefaults, updateSettings } from "../../../src/controllers/settingsController";
import { createMockRes, createMockReq } from "../../mocks/express";

describe("getSettingsDefaults", () => {
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
        expect(body.settings).toHaveProperty("refresh_interval_ms");
        expect(body.settings).toHaveProperty("sensor_list_visible");
        expect(body.settings).toHaveProperty("dashboard_layout");
        expect(body.settings).toHaveProperty("cards_per_row");
        expect(body.settings).toHaveProperty("sound_enabled");
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
        expect(schema).toHaveProperty("refresh_interval_ms");
        expect(schema).toHaveProperty("sensor_list_visible");
        expect(schema).toHaveProperty("dashboard_layout");
        expect(schema).toHaveProperty("cards_per_row");
        expect(schema).toHaveProperty("sound_enabled");
        expect(schema).toHaveProperty("notification_level");
        expect(schema).toHaveProperty("time_range_hours");
        expect(schema).toHaveProperty("decimal_places");
        expect(schema).toHaveProperty("mqtt_broker_address");
        expect(schema).toHaveProperty("mqtt_topic_telemetry");
        expect(schema).toHaveProperty("mqtt_topic_command");
        expect(schema).toHaveProperty("mqtt_topic_command_response");
        expect(schema).toHaveProperty("prometheus_port");
        expect(schema).toHaveProperty("express_port");
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
        expect((schema["theme"] as Record<string, unknown>).enum).toEqual(["light", "dark"]);
        expect((schema["dashboard_layout"] as Record<string, unknown>).enum).toEqual(["grid", "list"]);
        expect((schema["notification_level"] as Record<string, unknown>).enum).toEqual(["none", "warn", "critical"]);
    });

    it("should include min/max for numeric settings that have ranges", async () => {
        const { res, sendCalls } = createMockRes();
        const req = createMockReq() as Request;

        await getSettingsDefaults(req, res as Response);

        const body = sendCalls[0] as Record<string, unknown>;
        const schema = body.schema as Record<string, unknown>;
        expect((schema["refresh_interval_ms"] as Record<string, unknown>).min).toBe(1000);
        expect((schema["refresh_interval_ms"] as Record<string, unknown>).max).toBe(60000);
        expect((schema["cards_per_row"] as Record<string, unknown>).min).toBe(1);
        expect((schema["cards_per_row"] as Record<string, unknown>).max).toBe(6);
    });

    it("should mark optional settings correctly", async () => {
        const { res, sendCalls } = createMockRes();
        const req = createMockReq() as Request;

        await getSettingsDefaults(req, res as Response);

        const body = sendCalls[0] as Record<string, unknown>;
        const schema = body.schema as Record<string, unknown>;
        expect((schema["mqtt_broker_address"] as Record<string, unknown>).optional).toBe(true);
        expect((schema["refresh_interval_ms"] as Record<string, unknown>).optional).toBeFalsy();
    });
});

describe("getAllSettings", () => {
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
        expect(body).toHaveProperty("refresh_interval_ms");
        expect(body).toHaveProperty("sensor_list_visible");
        expect(body).toHaveProperty("dashboard_layout");
        expect(body).toHaveProperty("cards_per_row");
        expect(body).toHaveProperty("sound_enabled");
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
        expect(body.refresh_interval_ms).toBe(5000);
        expect(body.sensor_list_visible).toBe(true);
        expect(body.dashboard_layout).toBe("grid");
        expect(body.cards_per_row).toBe(3);
        expect(body.sound_enabled).toBe(false);
        expect(body.notification_level).toBe("warn");
        expect(body.time_range_hours).toBe(24);
        expect(body.decimal_places).toBe(2);
    });
});

describe("updateSettings", () => {
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
        expect(body.refresh_interval_ms).toBe(5000);
        expect(body.sensor_list_visible).toBe(true);
    });

    it("should handle multiple field updates", async () => {
        const { res, sendCalls } = createMockRes();
        const req = createMockReq({ body: { theme: "dark", cards_per_row: 4 } }) as Request;

        await updateSettings(req, res as Response);

        const body = sendCalls[0] as Record<string, unknown>;
        expect(body.theme).toBe("dark");
        expect(body.cards_per_row).toBe(4);
    });
});
