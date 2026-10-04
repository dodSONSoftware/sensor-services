/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import request from "supertest";
import express from "express";
import { CreateGeneralRoutes } from "../../../src/routes/generalRoutes";
import { createMockMqttNetworking } from "../../mocks/mqtt";

beforeEach(() => {
  jest.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true,
    status: 200,
    json: jest.fn().mockResolvedValue({}),
    text: jest.fn().mockResolvedValue(""),
    headers: new Headers(),
    redirected: false,
    statusText: "OK",
    url: "",
    clone: jest.fn(),
    body: null,
    bodyUsed: false,
    arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(0)),
    blob: jest.fn().mockResolvedValue(new Blob()),
    formData: jest.fn().mockResolvedValue(new FormData()),
    bytes: jest.fn().mockResolvedValue(new Uint8Array()),
  } as Response);
});

afterEach(() => {
  jest.restoreAllMocks();
});

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
      expect(res.body).toHaveProperty("system");
      expect(res.body.system).toHaveProperty("status");
      expect(res.body.system).toHaveProperty("mqtt");
      expect(res.body.system).toHaveProperty("ipPinger");
      expect(res.body.system).toHaveProperty("sensorTelemetry");
      expect(res.body.system).toHaveProperty("bootdate");
      expect(res.body).toHaveProperty("routes");
      expect(Array.isArray(res.body.routes)).toBe(true);
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
    it("should return health object with MQTT check", async () => {
      const app = createTestApp();

      const res = await request(app).get("/health");

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toMatch(/application\/json/);
      expect(res.body).toHaveProperty("status");
      expect(res.body.status).toBe("healthy");
      expect(res.body).toHaveProperty("mqtt");
      expect(res.body.mqtt).toBe("connected");
      expect(res.body).toHaveProperty("timestamp");
    });

    it("should report unhealthy status with HTTP 503 when mqtt is not connected", async () => {
      const app = createTestApp(false);

      const res = await request(app).get("/health");

      expect(res.status).toBe(503);
      expect(res.body.status).toBe("unhealthy");
      expect(res.body.mqtt).toBe("disconnected");
      expect(res.body.ipPinger).toBe("healthy");
      expect(res.body.sensorTelemetry).toBe("healthy");
    });
  });

  describe("GET /metrics", () => {
    it("should return Prometheus-formatted API metrics", async () => {
      const app = createTestApp();

      const res = await request(app).get("/metrics");

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toMatch(/text\/plain/);
      expect(res.text).toContain("http_requests_total");
      expect(res.text).toContain("http_request_duration_seconds");
      expect(res.text).toContain("http_errors_total");
    });

    it("should return HELP and TYPE lines for all API metrics", async () => {
      const app = createTestApp();

      const res = await request(app).get("/metrics");

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
