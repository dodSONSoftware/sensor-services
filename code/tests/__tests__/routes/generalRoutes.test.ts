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
});
