/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import express from "express";
import request from "supertest";

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

    describe("GET /ui/settings", () => {
        it("should return 200 with all settings keys", async () => {
            const res = await request(app).get("/ui/settings");

            expect(res.status).toBe(200);
            expect(res.headers["content-type"]).toContain("application/json");
            expect(res.body).toHaveProperty("theme");
            expect(res.body).toHaveProperty("dashboard_layout");
            expect(res.body).toHaveProperty("notification_level");
            expect(res.body).toHaveProperty("time_range_hours");
            expect(res.body).toHaveProperty("decimal_places");
        });

        it("should return default values when no settings exist", async () => {
            const res = await request(app).get("/ui/settings");

            expect(res.body.theme).toBe("light");
        });
    });

    describe("GET /ui/settings-schema", () => {
        it("should return 200 with an array of setting definitions", async () => {
            const res = await request(app).get("/ui/settings-schema");

            expect(res.status).toBe(200);
            expect(res.headers["content-type"]).toContain("application/json");
            expect(Array.isArray(res.body)).toBe(true);
        });

        it("should return setting definitions with name, type, default, range, and description", async () => {
            const res = await request(app).get("/ui/settings-schema");

            const body = res.body as Record<string, unknown>[];
            const themeSetting = body.find(s => s.name === "theme");

            expect(themeSetting).toBeDefined();
            expect(themeSetting?.type).toBe("enum");
            expect(themeSetting?.default).toBe("light");
            expect(themeSetting?.range).toEqual({ options: ["light", "dark"] });
            expect(themeSetting?.description).toBeDefined();
        });

        it("should include correct type for all settings", async () => {
            const res = await request(app).get("/ui/settings-schema");

            const body = res.body as Record<string, unknown>[];
            const settingsMap = Object.fromEntries(body.map(s => [s.name as string, s]));

            expect(settingsMap["theme"].type).toBe("enum");
            expect(settingsMap["dashboard_layout"].type).toBe("enum");
            expect(settingsMap["time_range_hours"].type).toBe("number");
            expect(settingsMap["mqtt_broker_address"].type).toBe("string");
        });

        it("should include correct range for numeric settings", async () => {
            const res = await request(app).get("/ui/settings-schema");

            const body = res.body as Record<string, unknown>[];
            const pingDelaySetting = body.find(s => s.name === "ping_delay_ms");

            expect(pingDelaySetting?.range).toEqual({
                min: 0,
                max: 1000,
                step: 10,
            });
        });

        it("should include correct range for enum settings", async () => {
            const res = await request(app).get("/ui/settings-schema");

            const body = res.body as Record<string, unknown>[];
            const layoutSetting = body.find(s => s.name === "dashboard_layout");

            expect(layoutSetting?.range).toEqual({
                options: ["cards", "list"],
            });
        });

        it("should include all expected settings", async () => {
            const res = await request(app).get("/ui/settings-schema");

            const body = res.body as Record<string, unknown>[];
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

    describe("PATCH /ui/settings-update", () => {
        it("should return 200 with merged settings after partial update", async () => {
            const res = await request(app)
                .patch("/ui/settings-update")
                .send({ theme: "dark" });

            expect(res.status).toBe(200);
            expect(res.headers["content-type"]).toContain("application/json");
            expect(res.body.theme).toBe("dark");
        });

        it("should preserve unchanged keys after partial update", async () => {
            const res = await request(app)
                .patch("/ui/settings-update")
                .send({ theme: "dark" });

            expect(res.body.dashboard_layout).toBe("cards");
        });

        it("should handle multiple field updates", async () => {
            const res = await request(app)
                .patch("/ui/settings-update")
                .send({ theme: "dark", notification_level: "critical" });

            expect(res.status).toBe(200);
            expect(res.body.theme).toBe("dark");
            expect(res.body.notification_level).toBe("critical");
        });

        it("should reflect updated values on subsequent GET", async () => {
            await request(app)
                .patch("/ui/settings-update")
                .send({ theme: "dark" });

            const res = await request(app).get("/ui/settings");

            expect(res.body.theme).toBe("dark");
        });
    });
});
