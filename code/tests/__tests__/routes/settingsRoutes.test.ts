/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import express from "express";
import request from "supertest";

// Mock settingsStore so tests don't require a real DB connection.
const baseMockCache = {
    theme: true,
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

import { CreateSettingsRoutes } from "../../../src/routes/settingsRoutes";

let currentMockCache = { ...baseMockCache };

describe("settings routes", () => {
    let app: express.Application;

    beforeEach(() => {
        jest.clearAllMocks();
        currentMockCache = { ...baseMockCache };
        app = express();
        // Apply minimal middleware so body parsing works
        app.use(express.json());
        new CreateSettingsRoutes(app);
    });

    describe("GET /settings", () => {
        it("should return 200 with all settings keys", async () => {
            const res = await request(app).get("/settings");

            expect(res.status).toBe(200);
            expect(res.headers["content-type"]).toContain("application/json");
            expect(res.body).toHaveProperty("theme");
            expect(res.body).toHaveProperty("dashboard_layout");
            expect(res.body).toHaveProperty("notification_level");
            expect(res.body).toHaveProperty("time_range_hours");
            expect(res.body).toHaveProperty("decimal_places");
        });

        it("should return default values when no settings exist", async () => {
            const res = await request(app).get("/settings");

            expect(res.body.theme).toBe(true);
        });
    });

    describe("GET /settings/defaults", () => {
        it("should return 200 with settings and schema objects", async () => {
            const res = await request(app).get("/settings/defaults");

            expect(res.status).toBe(200);
            expect(res.headers["content-type"]).toContain("application/json");
            expect(res.body).toHaveProperty("settings");
            expect(res.body).toHaveProperty("schema");
        });

        it("should return settings with all expected keys", async () => {
            const res = await request(app).get("/settings/defaults");

            expect(res.body.settings).toHaveProperty("theme");
            expect(res.body.settings).toHaveProperty("dashboard_layout");
            expect(res.body.settings).toHaveProperty("notification_level");
            expect(res.body.settings).toHaveProperty("time_range_hours");
            expect(res.body.settings).toHaveProperty("decimal_places");
        });

        it("should return schema with metadata for every setting", async () => {
            const res = await request(app).get("/settings/defaults");

            const schema = res.body.schema as Record<string, unknown>;
            expect(schema).toHaveProperty("theme");
            expect(schema).toHaveProperty("dashboard_layout");
            expect(schema).toHaveProperty("notification_level");
            expect(schema).toHaveProperty("time_range_hours");
            expect(schema).toHaveProperty("decimal_places");
            expect(schema).toHaveProperty("mqtt_broker_address");
            
            expect(schema).toHaveProperty("mqtt_topic_command");
            expect(schema).toHaveProperty("mqtt_topic_command_response");
        });

        it("should include label, description, type, and default in each schema entry", async () => {
            const res = await request(app).get("/settings/defaults");

            const themeSchema = (res.body.schema as Record<string, unknown>)["theme"] as Record<string, unknown>;
            expect(themeSchema).toHaveProperty("label");
            expect(themeSchema).toHaveProperty("description");
            expect(themeSchema).toHaveProperty("type");
            expect(themeSchema).toHaveProperty("default");
        });

        it("should include enum values for settings that have them", async () => {
            const res = await request(app).get("/settings/defaults");

            const schema = res.body.schema as Record<string, unknown>;
            expect((schema["dashboard_layout"] as Record<string, unknown>).options).toEqual(["cards", "list"]);
            expect((schema["notification_level"] as Record<string, unknown>).options).toEqual(["none", "warn", "critical"]);
        });

        it("should include min/max for numeric settings that have ranges", async () => {
            const res = await request(app).get("/settings/defaults");

            const schema = res.body.schema as Record<string, unknown>;
            expect((schema["ping_delay_ms"] as Record<string, unknown>).min).toBe(100);
            expect((schema["ping_delay_ms"] as Record<string, unknown>).max).toBe(5000);
        });

        it("should mark optional settings correctly", async () => {
            const res = await request(app).get("/settings/defaults");

            const schema = res.body.schema as Record<string, unknown>;
            expect((schema["mqtt_broker_address"] as Record<string, unknown>).optional).toBe(true);
        });
    });

    describe("PATCH /settings/update", () => {
        it("should return 200 with merged settings after partial update", async () => {
            const res = await request(app)
                .patch("/settings/update")
                .send({ theme: false });

            expect(res.status).toBe(200);
            expect(res.headers["content-type"]).toContain("application/json");
            expect(res.body.theme).toBe(false);
        });

        it("should preserve unchanged keys after partial update", async () => {
            const res = await request(app)
                .patch("/settings/update")
                .send({ theme: false });

            expect(res.body.dashboard_layout).toBe("grid");
        });

        it("should handle multiple field updates", async () => {
            const res = await request(app)
                .patch("/settings/update")
                .send({ theme: false, notification_level: "critical" });

            expect(res.status).toBe(200);
            expect(res.body.theme).toBe(false);
            expect(res.body.notification_level).toBe("critical");
        });

        it("should reflect updated values on subsequent GET", async () => {
            await request(app)
                .patch("/settings/update")
                .send({ theme: false });

            const res = await request(app).get("/settings");

            expect(res.body.theme).toBe(false);
        });
    });
});
