/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import fs from "fs";
import path from "path";
import express from "express";
import request from "supertest";

// Use a temporary config file for testing
const TEST_CONFIG_PATH = path.join(__dirname, "test-config.yml");

describe("config routes", () => {
    let app: express.Application;

    // Create a valid test config file before each test
    beforeEach(() => {
        const testConfig = `
express-port: 32000
log-level: debug
mqtt-broker-ip-address: "10.10.10.64"
mqtt-topic-telemetry: "iot/telemetry"
mqtt-topic-command: "iot/v2/command"
mqtt-topic-command-response: "iot/v2/command-response"
ip-pinger-web-api: "http://10.10.10.50:3300"
case-sensitive: true
db-host: "10.10.10.64"
db-port: 5432
db-name: "sensor_web_services"
db-user: "appuser"
db-password: "testpass"
`;
        fs.writeFileSync(TEST_CONFIG_PATH, testConfig);

        app = express();
        app.use(express.json());

        // Import and register config routes
        const { CreateConfigRoutes } = require("../../../src/routes/configRoutes");
        const { setTestConfigPath } = require("../../../src/controllers/configController");
        // Override the test path in the controller
        setTestConfigPath(TEST_CONFIG_PATH);
        new CreateConfigRoutes(app);
    });

    afterEach(() => {
        // Clean up test config file
        try {
            fs.unlinkSync(TEST_CONFIG_PATH);
        } catch {
            // Ignore if file doesn't exist
        }
    });

    describe("GET /reload-config", () => {
        it("should return 200 with success message when config is valid", async () => {
            const res = await request(app).get("/reload-config");

            expect(res.status).toBe(200);
            expect(res.headers["content-type"]).toContain("application/json");
            expect(res.body.success).toBe(true);
            expect(res.body.message).toBe("Configuration reloaded successfully");
        });

        it("should return 500 when config file cannot be found", async () => {
            // Delete the config file entirely
            fs.unlinkSync(TEST_CONFIG_PATH);

            try {
                const res = await request(app).get("/reload-config");

                expect(res.status).toBe(500);
                expect(res.body.success).toBe(false);
                expect(res.body.message).toContain("Could not find config file");
            } finally {
                // Recreate the config file
                const testConfig = `
express-port: 32000
log-level: debug
mqtt-broker-ip-address: "10.10.10.64"
mqtt-topic-telemetry: "iot/telemetry"
mqtt-topic-command: "iot/v2/command"
mqtt-topic-command-response: "iot/v2/command-response"
ip-pinger-web-api: "http://10.10.10.50:3300"
case-sensitive: true
db-host: "10.10.10.64"
db-port: 5432
db-name: "sensor_web_services"
db-user: "appuser"
db-password: "testpass"
`;
                fs.writeFileSync(TEST_CONFIG_PATH, testConfig);
            }
        });
    });

    describe("GET /read-config", () => {
        it("should return 200 with current configuration", async () => {
            // First reload to initialize config
            await request(app).get("/reload-config");

            const res = await request(app).get("/read-config");

            expect(res.status).toBe(200);
            expect(res.headers["content-type"]).toContain("application/json");
            expect(res.body["express-port"]).toBe(32000);
            expect(res.body["log-level"]).toBe("debug");
            expect(res.body["mqtt-broker-ip-address"]).toBe("10.10.10.64");
        });
    });

    describe("POST /write-config", () => {
        it("should return 200 with success message when config is valid", async () => {
            const newConfig = {
                "express-port": 32001,
                "log-level": "info",
                "mqtt-broker-ip-address": "10.10.10.100",
                "mqtt-topic-telemetry": "iot/new-telemetry",
                "mqtt-topic-command": "iot/v2/new-command",
                "mqtt-topic-command-response": "iot/v2/new-response",
                "ip-pinger-web-api": "http://10.10.10.50:3300",
                "case-sensitive": false,
                "db-host": "10.10.10.64",
                "db-port": 5432,
                "db-name": "sensor_web_services",
                "db-user": "appuser",
                "db-password": "newpass"
            };

            const res = await request(app)
                .post("/write-config")
                .send(newConfig);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.message).toBe("Configuration updated successfully");

            // Verify the config file was written
            const configFileContent = fs.readFileSync(TEST_CONFIG_PATH, "utf8");
            expect(configFileContent).toContain("express-port: 32001");
            expect(configFileContent).toContain("log-level: info");
        });

        it("should return 400 when config validation fails", async () => {
            const invalidConfig = {
                "express-port": -1, // Invalid: must be positive
                "log-level": "debug",
                "mqtt-broker-ip-address": "10.10.10.64",
                "mqtt-topic-telemetry": "iot/telemetry",
                "mqtt-topic-command": "iot/v2/command",
                "mqtt-topic-command-response": "iot/v2/command-response",
                "ip-pinger-web-api": "http://10.10.10.50:3300",
                "case-sensitive": true,
                "db-host": "10.10.10.64",
                "db-port": 5432,
                "db-name": "sensor_web_services",
                "db-user": "appuser",
                "db-password": "testpass"
            };

            const res = await request(app)
                .post("/write-config")
                .send(invalidConfig);

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toContain("Config validation failed");
        });

        it("should return 400 when request body is empty", async () => {
            const res = await request(app)
                .post("/write-config")
                .send("");

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toBe("Request body must be a JSON object");
        });
    });
});
