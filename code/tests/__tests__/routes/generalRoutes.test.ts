/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import request from "supertest";
import express from "express";
import { CreateGeneralRoutes } from "../../../src/routes/generalRoutes";
import { createMockMqttNetworking } from "../../mocks/mqtt";

function createTestApp(mqttConnected: boolean = true): express.Application {
  const app = express();
  app.use(express.json());
  const networking = createMockMqttNetworking({
    is_connected: jest.fn().mockReturnValue(mqttConnected),
  });
  new CreateGeneralRoutes(app, networking);
  return app;
}

describe("General Routes", () => {
  describe("GET /about", () => {
    it("should return IAbout JSON with OK status", async () => {
      const app = createTestApp();

      const res = await request(app).get("/about");

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toMatch(/application\/json/);
      expect(res.body).toHaveProperty("about");
      expect(res.body.about).toHaveProperty("name");
      expect(res.body.about).toHaveProperty("version");
      expect(res.body.about).toHaveProperty("author");
      expect(res.body.about).toHaveProperty("license");
      expect(res.body).toHaveProperty("commands");
      expect(Array.isArray(res.body.commands)).toBe(true);
    });
  });

  describe("GET /date_local", () => {
    it("should return a formatted local date string", async () => {
      const app = createTestApp();

      const res = await request(app).get("/date_local");

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toMatch(/text\/plain/);
      expect(res.text).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
    });
  });

  describe("GET /date_utc", () => {
    it("should return a formatted UTC date string", async () => {
      const app = createTestApp();

      const res = await request(app).get("/date_utc");

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toMatch(/text\/plain/);
      expect(res.text).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    });
  });

  describe("GET /date-local", () => {
    it("should return a formatted local date string", async () => {
      const app = createTestApp();

      const res = await request(app).get("/date-local");

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toMatch(/text\/plain/);
      expect(res.text).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
    });
  });

  describe("GET /date-utc", () => {
    it("should return a formatted UTC date string", async () => {
      const app = createTestApp();

      const res = await request(app).get("/date-utc");

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toMatch(/text\/plain/);
      expect(res.text).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    });
  });

  describe("GET /health", () => {
    it("should return health object with all dependency checks", async () => {
      const app = createTestApp();

      const res = await request(app).get("/health");

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toMatch(/application\/json/);
      expect(res.body).toHaveProperty("status");
      expect(res.body).toHaveProperty("service");
      expect(res.body).toHaveProperty("version");
      expect(res.body).toHaveProperty("mqtt");
      expect(res.body).toHaveProperty("prometheus_server");
      expect(res.body).toHaveProperty("uptime_seconds");
      expect(typeof res.body.uptime_seconds).toBe("number");
      expect(res.body).toHaveProperty("timestamp");
      expect(res.body).toHaveProperty("memory");
      expect(res.body.memory).toHaveProperty("rss");
      expect(res.body.memory).toHaveProperty("heap_used");
      expect(res.body.memory).toHaveProperty("heap_total");
      expect(res.body).toHaveProperty("cpu");
      expect(res.body.cpu).toHaveProperty("load");
    });

    it("should report degraded when mqtt is disconnected", async () => {
      const app = createTestApp(false);

      const res = await request(app).get("/health");

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("degraded");
      expect(res.body.mqtt).toBe("disconnected");
    });
  });

  describe("GET /ready", () => {
    it("should return 200 when all subsystems are ready", async () => {
      const app = createTestApp();

      const res = await request(app).get("/ready");

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toMatch(/application\/json/);
      expect(res.body.status).toBe("ready");
      expect(res.body.dependencies.mqtt).toBe("connected");
      expect(res.body.dependencies.prometheus_server).toBe("ready");
    });

    it("should return 503 when MQTT is disconnected", async () => {
      const app = createTestApp(false);

      const res = await request(app).get("/ready");

      expect(res.status).toBe(503);
      expect(res.body.status).toBe("not_ready");
      expect(res.body.dependencies.mqtt).toBe("disconnected");
    });
  });

  describe("GET /metrics/api", () => {
    it("should return Prometheus-formatted API metrics", async () => {
      const app = createTestApp();

      const res = await request(app).get("/metrics/api");

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toMatch(/text\/plain/);
      expect(res.text).toContain("http_requests_total");
      expect(res.text).toContain("http_request_duration_seconds");
      expect(res.text).toContain("http_errors_total");
    });

    it("should return HELP and TYPE lines for all API metrics", async () => {
      const app = createTestApp();

      const res = await request(app).get("/metrics/api");

      expect(res.status).toBe(200);
      expect(res.text).toContain("# HELP http_requests_total Total number of HTTP requests.");
      expect(res.text).toContain("# TYPE http_requests_total counter");
      expect(res.text).toContain("# HELP http_request_duration_seconds HTTP request duration in seconds.");
      expect(res.text).toContain("# TYPE http_request_duration_seconds histogram");
      expect(res.text).toContain("# HELP http_errors_total Total number of HTTP 5xx errors.");
      expect(res.text).toContain("# TYPE http_errors_total counter");
    });
  });
});
