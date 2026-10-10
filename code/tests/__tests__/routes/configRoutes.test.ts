/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import fs from "fs";
import path from "path";
import express from "express";
import request from "supertest";
import { setConfig } from "../../../src/common/global";

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
mqtt-topic-command: "iot/v2/command"
mqtt-topic-command-response: "iot/v2/command-response"
ip-pinger-web-api: "http://10.10.10.50:32001"
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
        const configRoutes = new CreateConfigRoutes(app);
        configRoutes.register();
    });

    afterEach(() => {
        // Clean up test config file
        try {
            fs.unlinkSync(TEST_CONFIG_PATH);
        } catch {
            // Ignore if file doesn't exist
        }
        // Reset the module-level running config so tests cannot observe a
        // previous test's in-memory state
        setConfig(undefined);
    });

    describe("GET /api/reload-config", () => {
        it("should return 200 with success message when config is valid", async () => {
            const res = await request(app).get("/api/reload-config");

            expect(res.status).toBe(200);
            expect(res.headers["content-type"]).toContain("application/json");
            expect(res.body.success).toBe(true);
            expect(res.body.message).toBe("Configuration reloaded successfully");
        });

        it("should return 500 when config file cannot be found", async () => {
            // Delete the config file entirely
            fs.unlinkSync(TEST_CONFIG_PATH);

            try {
                const res = await request(app).get("/api/reload-config");

                expect(res.status).toBe(500);
                expect(res.body.success).toBe(false);
                expect(res.body.message).toContain("Could not find config file");
            } finally {
                // Recreate the config file
                const testConfig = `
express-port: 32000
log-level: debug
mqtt-broker-ip-address: "10.10.10.64"
mqtt-topic-command: "iot/v2/command"
mqtt-topic-command-response: "iot/v2/command-response"
ip-pinger-web-api: "http://10.10.10.50:32001"
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

    describe("GET /api/read-config", () => {
        it("should return 200 with current configuration", async () => {
            // First reload to initialize config
            await request(app).get("/api/reload-config");

            const res = await request(app).get("/api/read-config");

            expect(res.status).toBe(200);
            expect(res.headers["content-type"]).toContain("application/json");
            expect(res.body["express-port"]).toBe(32000);
            expect(res.body["log-level"]).toBe("debug");
            expect(res.body["mqtt-broker-ip-address"]).toBe("10.10.10.64");
            // The complete configuration is returned — credentials unmasked
            expect(res.body["db-password"]).toBe("testpass");
        });

        it("should return the persisted configuration after a restart-required write", async () => {
            // Reload first so the write is diffed against a running config —
            // with no running config the reload contract has nothing to
            // classify as restart-required.
            await request(app).get("/api/reload-config");

            const writeRes = await request(app)
                .post("/api/write-config")
                .send({
                    "express-port": 32002,
                    "log-level": "info",
                    "mqtt-broker-ip-address": "10.10.10.101",
                    "mqtt-topic-command": "iot/v2/command",
                    "mqtt-topic-command-response": "iot/v2/command-response",
                    "ip-pinger-web-api": "http://10.10.10.50:32001",
                    "case-sensitive": true,
                    "db-host": "10.10.10.64",
                    "db-port": 5432,
                    "db-name": "sensor_web_services",
                    "db-user": "appuser",
                    "db-password": "testpass"
                });
            expect(writeRes.status).toBe(200);
            expect(writeRes.body.restart_required).toBe(true);

            // The persisted (on-disk) values are reported even though the
            // process has not restarted yet
            const res = await request(app).get("/api/read-config");

            expect(res.status).toBe(200);
            expect(res.body["express-port"]).toBe(32002);
            expect(res.body["mqtt-broker-ip-address"]).toBe("10.10.10.101");
            expect(res.body["log-level"]).toBe("info");
        });
    });

    describe("POST /api/write-config", () => {
        it("should return 200 with success message when config is valid", async () => {
            // Load the test config into the running state first — newConfig
            // differs from it in operational keys, and the restart contract
            // is reported relative to the running config.
            await request(app).get("/api/reload-config");

            const newConfig = {
                "express-port": 32001,
                "log-level": "info",
                "mqtt-broker-ip-address": "10.10.10.100",
                "mqtt-topic-command": "iot/v2/new-command",
                "mqtt-topic-command-response": "iot/v2/new-response",
                "ip-pinger-web-api": "http://10.10.10.50:32001",
                "case-sensitive": false,
                "db-host": "10.10.10.64",
                "db-port": 5432,
                "db-name": "sensor_web_services",
                "db-user": "appuser",
                "db-password": "newpass"
            };

            const res = await request(app)
                .post("/api/write-config")
                .send(newConfig);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            // newConfig differs from the previously loaded test config in
            // operational keys, so the reload contract reports them as
            // restart-required (the log-level change is applied live)
            expect(res.body.restart_required).toBe(true);
            expect(res.body.restart_keys).toEqual([
                "case-sensitive",
                "db-password",
                "express-port",
                "mqtt-broker-ip-address",
                "mqtt-topic-command",
                "mqtt-topic-command-response",
            ]);
            expect(res.body.applied_keys).toEqual(["log-level"]);
            expect(res.body.message).toContain("restart required for:");

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
                "mqtt-topic-command": "iot/v2/command",
                "mqtt-topic-command-response": "iot/v2/command-response",
                "ip-pinger-web-api": "http://10.10.10.50:32001",
                "case-sensitive": true,
                "db-host": "10.10.10.64",
                "db-port": 5432,
                "db-name": "sensor_web_services",
                "db-user": "appuser",
                "db-password": "testpass"
            };

            const res = await request(app)
                .post("/api/write-config")
                .send(invalidConfig);

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toContain("Config validation failed");
        });

        it("should return 400 when request body is empty", async () => {
            const res = await request(app)
                .post("/api/write-config")
                .send("");

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toBe("Request body must be a JSON object");
        });
    });

    describe("GET /api/read-running-config", () => {
        it("should return 200 with the active in-memory configuration", async () => {
            // First reload to initialize the running config
            await request(app).get("/api/reload-config");

            const res = await request(app).get("/api/read-running-config");

            expect(res.status).toBe(200);
            expect(res.headers["content-type"]).toContain("application/json");
            expect(res.body["log-level"]).toBe("debug");
            // The complete configuration is returned — credentials unmasked
            expect(res.body["db-password"]).toBe("testpass");
        });

        it("should report restart-required keys as their pre-restart values", async () => {
            await request(app).get("/api/reload-config");

            const writeRes = await request(app)
                .post("/api/write-config")
                .send({
                    "express-port": 32000,
                    "log-level": "info",
                    "mqtt-broker-ip-address": "10.10.10.100",
                    "mqtt-topic-command": "iot/v2/command",
                    "mqtt-topic-command-response": "iot/v2/command-response",
                    "ip-pinger-web-api": "http://10.10.10.50:32001",
                    "case-sensitive": true,
                    "db-host": "10.10.10.64",
                    "db-port": 5432,
                    "db-name": "sensor_web_services",
                    "db-user": "appuser",
                    "db-password": "testpass"
                });
            expect(writeRes.status).toBe(200);
            expect(writeRes.body.restart_required).toBe(true);

            // log-level was applied live; the restart-required key still
            // reports the value the process is actually running
            const res = await request(app).get("/api/read-running-config");

            expect(res.status).toBe(200);
            expect(res.body["log-level"]).toBe("info");
            expect(res.body["mqtt-broker-ip-address"]).toBe("10.10.10.64");
            expect(res.body["db-password"]).toBe("testpass");
        });

        it("should return 500 when the running config is not initialized", async () => {
            const res = await request(app).get("/api/read-running-config");

            expect(res.status).toBe(500);
            expect(res.body.error).toBe("Configuration not initialized");
        });
    });
});
