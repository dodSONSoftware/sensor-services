/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import request from "supertest";
import express from "express";
import type { z } from "zod";

import { CreateSensorRoutes } from "../../../src/routes/sensorRoutes";
import { CreateMiddleware } from "../../../src/middleware/middleware";
import { validateConfig, type configSchema } from "../../../src/schemas/config";
import { createMockMqttNetworking } from "../../mocks/mqtt";

function createTestApp(): express.Application {
  const app = express();
  app.use(express.json());
  const networking = createMockMqttNetworking();
  const sensorRoutes = new CreateSensorRoutes(app, networking);
  sensorRoutes.register();
  return app;
}

// Config for the production-equivalent stack below, in the same shape the
// CreateMiddleware integration tests (middleware.test.ts) use.
const config: z.infer<typeof configSchema> = validateConfig({
  "log-level": "error",
  "express-port": 32000,
  "mqtt-broker-ip-address": "10.10.10.64",
  "mqtt-topic-command": "iot/v3/command",
  "mqtt-topic-command-response": "iot/v3/command-response",
  "ip-pinger-web-api": "http://10.10.10.50:32001",
  "case-sensitive": true,
  "db-host": "10.10.10.64",
  "db-port": 5432,
  "db-name": "sensor_web_services",
  "db-user": "appuser",
  "db-password": "testpass",
});

describe("Sensor Routes", () => {
  describe("GET /sensors/identify (removed)", () => {
    it("should return 404 — firmware v4 has no identify command", async () => {
      const app = createTestApp();

      const res = await request(app).get("/sensors/identify");

      expect(res.status).toBe(404);
    });

    it("should return 404 for /sensors/identify/:source", async () => {
      const app = createTestApp();

      const res = await request(app).get("/sensors/identify/air-temp-1");

      expect(res.status).toBe(404);
    });
  });

  describe("GET /sensors/get-details", () => {
    it("should return 200 and delegate to sensor controller", async () => {
      const app = createTestApp();

      const res = await request(app).get("/sensors/get-details");

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toMatch(/application\/json/);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe("GET /sensors/get-details/:source", () => {
    it("should return 200 and delegate to sensor controller with source param", async () => {
      const app = createTestApp();

      const res = await request(app).get("/sensors/get-details/wind-sensor-1");

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toMatch(/application\/json/);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe("GET /sensors/reboot", () => {
    it("should return 200 and delegate to sensor controller", async () => {
      const app = createTestApp();

      const res = await request(app).get("/sensors/reboot");

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toMatch(/application\/json/);
      expect(Array.isArray(res.body)).toBe(true);
      // Verify enhanced response format with command_metadata
      expect(res.body[0]).toHaveProperty("source");
      expect(res.body[0]).toHaveProperty("payload");
      expect(res.body[0]).toHaveProperty("command_metadata");
      expect(res.body[0].command_metadata).toMatchObject({
        command_id: expect.any(String),
        command_sent_at: expect.any(String),
        expected_delay_seconds: 5,
      });
    });
  });

  describe("GET /sensors/reboot/:source", () => {
    it("should return 200 and delegate to sensor controller with source param", async () => {
      const app = createTestApp();

      const res = await request(app).get("/sensors/reboot/air-temp-1");

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toMatch(/application\/json/);
      expect(Array.isArray(res.body)).toBe(true);
      // Verify enhanced response format with command_metadata
      expect(res.body[0]).toHaveProperty("source");
      expect(res.body[0]).toHaveProperty("payload");
      expect(res.body[0]).toHaveProperty("command_metadata");
      expect(res.body[0].command_metadata).toMatchObject({
        command_id: expect.any(String),
        command_sent_at: expect.any(String),
        expected_delay_seconds: 5,
      });
    });
  });

  describe("POST /sensors/reboot", () => {
    it("should return 200, publish exactly one reboot command targeted at all sensors", async () => {
      const networking = createMockMqttNetworking();
      const app = express();
      app.use(express.json());
      const sensorRoutes = new CreateSensorRoutes(app, networking);
      sensorRoutes.register();

      const res = await request(app).post("/sensors/reboot");

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toMatch(/application\/json/);
      expect(Array.isArray(res.body)).toBe(true);
      // Exactly one MQTT command, with the correct command and target
      expect(networking.publish_mqtt_message).toHaveBeenCalledTimes(1);
      const [topic, message] = (networking.publish_mqtt_message as jest.Mock).mock.calls[0];
      expect(topic).toBe(networking.mqtt_topic_command);
      expect(message).toMatchObject({ command: "reboot", target: "*" });
    });
  });

  describe("POST /sensors/reboot/:source", () => {
    it("should return 200, publish exactly one reboot command targeted at the source", async () => {
      const networking = createMockMqttNetworking();
      const app = express();
      app.use(express.json());
      const sensorRoutes = new CreateSensorRoutes(app, networking);
      sensorRoutes.register();

      const res = await request(app).post("/sensors/reboot/air-temp-1");

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toMatch(/application\/json/);
      expect(Array.isArray(res.body)).toBe(true);
      // Exactly one MQTT command, with the correct command and target
      expect(networking.publish_mqtt_message).toHaveBeenCalledTimes(1);
      const [topic, message] = (networking.publish_mqtt_message as jest.Mock).mock.calls[0];
      expect(topic).toBe(networking.mqtt_topic_command);
      expect(message).toMatchObject({ command: "reboot", target: "air-temp-1" });
    });
  });

  describe("GET /sensors/read-config", () => {
    it("should return 200 and delegate to sensor controller", async () => {
      const app = createTestApp();

      const res = await request(app).get("/sensors/read-config");

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toMatch(/application\/json/);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe("GET /sensors/read-config/:source", () => {
    it("should return 200 and delegate to sensor controller with source param", async () => {
      const app = createTestApp();

      const res = await request(app).get("/sensors/read-config/rain-sensor-1");

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toMatch(/application\/json/);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe("POST /sensors/write-config/:source", () => {
    it("should return 200 and delegate to sensor controller with body", async () => {
      const app = createTestApp();

      const res = await request(app)
        .post("/sensors/write-config/air-temp-1")
        .send({ "write-config": { key: "value" } });

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toMatch(/application\/json/);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it("should return 200 with empty body", async () => {
      const app = createTestApp();

      const res = await request(app)
        .post("/sensors/write-config/air-temp-1")
        .send({});

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe("POST /sensors/update-config/:source (deprecated)", () => {
    it("should return 501 with an error pointing to write-config", async () => {
      const app = createTestApp();

      const res = await request(app)
        .post("/sensors/update-config/air-temp-1")
        .send({ "update-config": { key: "new-value" } });

      expect(res.status).toBe(501);
      expect(res.headers["content-type"]).toMatch(/application\/json/);
      expect(res.body).toHaveProperty("error");
      expect(String(res.body.error)).toMatch(/write-config/);
    });

    it("should return 501 with empty body", async () => {
      const app = createTestApp();

      const res = await request(app)
        .post("/sensors/update-config/air-temp-1")
        .send({});

      expect(res.status).toBe(501);
    });
  });

  // P3-9: the pre-fix version of this describe used the bare createTestApp()
  // (express.json() only, NO CreateMiddleware) and asserted 200 for a body
  // with an own `constructor` key, on the theory that "Express strips it".
  // body-parser strips only `__proto__`; an own `constructor` key reaches the
  // body-validation middleware, where postBodySchema rejects it. These tests
  // drive the request through the real CreateMiddleware pipeline — the same
  // validation production runs — and expect the production 400.
  describe("POST body validation (P3-9 — production middleware stack)", () => {
    function createProductionApp(): express.Application {
      const app = express();
      const middleware = new CreateMiddleware(app, config);
      middleware.register();
      const sensorRoutes = new CreateSensorRoutes(app, createMockMqttNetworking());
      sensorRoutes.register();
      return app;
    }

    it("should accept a normal object body", async () => {
      const app = createProductionApp();

      const res = await request(app)
        .post("/sensors/write-config/sensor-1")
        .send({ key: "value", nested: { foo: "bar" } });

      expect(res.status).toBe(200);
    });

    it("should return 400 for a body with an own constructor key", async () => {
      const app = createProductionApp();

      const res = await request(app)
        .post("/sensors/write-config/sensor-1")
        .send({ constructor: { foo: "bar" } });

      expect(res.status).toBe(400);
      expect(res.headers["content-type"]).toMatch(/application\/json/);
      expect(res.body).toHaveProperty("error");
    });

    it("should return 400 for a body with an own prototype key", async () => {
      const app = createProductionApp();

      const res = await request(app)
        .post("/sensors/write-config/sensor-1")
        .send({ prototype: { polluted: true } });

      expect(res.status).toBe(400);
      expect(res.headers["content-type"]).toMatch(/application\/json/);
      expect(res.body).toHaveProperty("error");
    });
  });
});
