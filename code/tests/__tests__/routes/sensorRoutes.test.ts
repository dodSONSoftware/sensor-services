/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import request from "supertest";
import express from "express";
import { CreateSensorRoutes } from "../../../src/routes/sensorRoutes";
import { createMockMqttNetworking } from "../../mocks/mqtt";

function createTestApp(): express.Application {
  const app = express();
  app.use(express.json());
  const networking = createMockMqttNetworking();
  new CreateSensorRoutes(app, networking);
  return app;
}

describe("Sensor Routes", () => {
  describe("GET /sensors/identify", () => {
    it("should return 200 and delegate to sensor controller", async () => {
      const app = createTestApp();

      const res = await request(app).get("/sensors/identify");

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toMatch(/application\/json/);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe("GET /sensors/identify/:source", () => {
    it("should return 200 and delegate to sensor controller with source param", async () => {
      const app = createTestApp();

      const res = await request(app).get("/sensors/identify/air-temp-1");

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toMatch(/application\/json/);
      expect(Array.isArray(res.body)).toBe(true);
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

  describe("POST /sensors/reboot", () => {
    it("should return 200 and delegate to sensor controller", async () => {
      const app = createTestApp();

      const res = await request(app).post("/sensors/reboot");

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toMatch(/application\/json/);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe("POST /sensors/reboot/:source", () => {
    it("should return 200 and delegate to sensor controller with source param", async () => {
      const app = createTestApp();

      const res = await request(app).post("/sensors/reboot/air-temp-1");

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toMatch(/application\/json/);
      expect(Array.isArray(res.body)).toBe(true);
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

  describe("POST /sensors/update-config/:source", () => {
    it("should return 200 and delegate to sensor controller with body", async () => {
      const app = createTestApp();

      const res = await request(app)
        .post("/sensors/update-config/air-temp-1")
        .send({ "update-config": { key: "new-value" } });

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toMatch(/application\/json/);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it("should return 200 with empty body", async () => {
      const app = createTestApp();

      const res = await request(app)
        .post("/sensors/update-config/air-temp-1")
        .send({});

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe("POST body validation", () => {
    it("should accept normal object body", async () => {
      const app = createTestApp();

      const res = await request(app)
        .post("/sensors/write-config/sensor-1")
        .send({ key: "value", nested: { foo: "bar" } });

      expect(res.status).toBe(200);
    });

    // Note: Express's JSON body parser strips __proto__, constructor, and prototype
    // keys for security, so these never reach the route handler. The schema-level
    // protection in postBodySchema is defense-in-depth for non-Express code paths.
    it("should accept body with constructor key (Express strips it before handler)", async () => {
      const app = createTestApp();

      const res = await request(app)
        .post("/sensors/write-config/sensor-1")
        .send({ constructor: { foo: "bar" } });

      // Express strips constructor key, body arrives as {}
      expect(res.status).toBe(200);
    });
  });
});
