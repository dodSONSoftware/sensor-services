/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import request from "supertest";
import express from "express";
import { CreatePingerRoutes } from "../../../src/routes/pingerRoutes";
import { createMockMqttNetworking } from "../../mocks/mqtt";

const MOCK_PINGER_API = "http://192.168.1.4:3300";
const MOCK_FETCH_TIMEOUT_MS = 10_000;

// Mock fetch for all pinger route tests (they proxy to an external service)
const originalFetch = global.fetch;

function createMockFetch(response: unknown, status: number = 200) {
  return jest.fn().mockResolvedValue({
    ok: true,
    status,
    json: jest.fn().mockResolvedValue(response),
  });
}

function createTestApp(fetchMock?: jest.Mock): express.Application {
  const app = express();
  app.use(express.json());
  const networking = createMockMqttNetworking();
  const pingerRoutes = new CreatePingerRoutes(app, networking, MOCK_PINGER_API, true, MOCK_FETCH_TIMEOUT_MS);
  if (fetchMock) {
    global.fetch = fetchMock;
  }
  return app;
}

describe("Pinger Routes", () => {
  beforeEach(() => {
    if (originalFetch) {
      global.fetch = originalFetch;
    }
  });

  describe("GET /ippinger/about", () => {
    it("should proxy to upstream and return response", async () => {
      const mockData = { name: "ip-pinger", version: "1.0.0" };
      const fetchMock = createMockFetch(mockData);
      const app = createTestApp(fetchMock);

      const res = await request(app).get("/ippinger/about");

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockData);
      expect(fetchMock).toHaveBeenCalledWith("http://192.168.1.4:3300/about", expect.anything());
    });

    it("should return 502 when upstream throws", async () => {
      jest.spyOn(global, "fetch").mockRejectedValue(new Error("ENOTFOUND"));
      const app = createTestApp();

      const res = await request(app).get("/ippinger/about");

      expect(res.status).toBe(502);
      expect(res.body).toHaveProperty("error", "upstream unavailable");
    });
  });

  describe("GET /ippinger/read-config", () => {
    it("should proxy to upstream and return response", async () => {
      const mockData = { devices: [{ source: "dev1", "ip-address": "192.168.1.10" }] };
      const fetchMock = createMockFetch(mockData);
      const app = createTestApp(fetchMock);

      const res = await request(app).get("/ippinger/read-config");

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockData);
    });

    it("should return 502 when upstream throws", async () => {
      jest.spyOn(global, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));
      const app = createTestApp();

      const res = await request(app).get("/ippinger/read-config");

      expect(res.status).toBe(502);
      expect(res.body.error).toBe("upstream unavailable");
    });
  });

  describe("POST /ippinger/write-config", () => {
    it("should POST to upstream and return response", async () => {
      const mockData = { success: true };
      const fetchMock = createMockFetch(mockData);
      const app = createTestApp(fetchMock);

      const res = await request(app)
        .post("/ippinger/write-config")
        .send({ key: "value" });

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockData);
      expect(fetchMock).toHaveBeenCalledWith(
        "http://192.168.1.4:3300/write-config",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: expect.any(AbortSignal),
        })
      );
    });

    it("should return 502 when upstream throws", async () => {
      jest.spyOn(global, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));
      const app = createTestApp();

      const res = await request(app)
        .post("/ippinger/write-config")
        .send({ key: "value" });

      expect(res.status).toBe(502);
      expect(res.body.error).toBe("upstream unavailable");
    });
  });

  describe("POST /ippinger/restart", () => {
    it("should POST to upstream and return response", async () => {
      const mockData = { restarted: true };
      const fetchMock = createMockFetch(mockData);
      const app = createTestApp(fetchMock);

      const res = await request(app)
        .post("/ippinger/restart")
        .send({ reason: "config-update" });

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockData);
    });

    it("should return 502 when upstream throws", async () => {
      jest.spyOn(global, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));
      const app = createTestApp();

      const res = await request(app)
        .post("/ippinger/restart")
        .send({});

      expect(res.status).toBe(502);
      expect(res.body.error).toBe("upstream unavailable");
    });
  });

  describe("GET /ippinger/ping", () => {
    it("should proxy to upstream and return ping results", async () => {
      const mockData = [
        { source: "dev1", "ip-address": "192.168.1.10", reachable: true },
      ];
      const fetchMock = createMockFetch(mockData);
      const app = createTestApp(fetchMock);

      const res = await request(app).get("/ippinger/ping");

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockData);
    });

    it("should return 502 when upstream throws", async () => {
      jest.spyOn(global, "fetch").mockRejectedValue(new Error("ENOTFOUND"));
      const app = createTestApp();

      const res = await request(app).get("/ippinger/ping");

      expect(res.status).toBe(502);
      expect(res.body.error).toBe("upstream unavailable");
    });
  });

  describe("GET /ippinger/ping/:target", () => {
    it("should proxy to upstream with target in URL", async () => {
      const mockData = [
        { source: "target", "ip-address": "8.8.8.8", reachable: true },
      ];
      const fetchMock = createMockFetch(mockData);
      const app = createTestApp(fetchMock);

      const res = await request(app).get("/ippinger/ping/8.8.8.8");

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockData);
      expect(fetchMock).toHaveBeenCalledWith(
        "http://192.168.1.4:3300/ping/8.8.8.8",
        expect.anything()
      );
    });

    it("should return 502 when upstream throws", async () => {
      jest.spyOn(global, "fetch").mockRejectedValue(new Error("ENOTFOUND"));
      const app = createTestApp();

      const res = await request(app).get("/ippinger/ping/8.8.4.4");

      expect(res.status).toBe(502);
      expect(res.body.error).toBe("upstream unavailable");
    });
  });

  describe("GET /ippinger/analyze-ippinger", () => {
    it("should return 200 with warning when upstream is unavailable", async () => {
      // fetch rejects for the ippinger read-config call, but mqtt identify succeeds (mocked)
      jest.spyOn(global, "fetch").mockRejectedValue(new Error("ENOTFOUND"));
      const app = createTestApp();

      const res = await request(app).get("/ippinger/analyze-ippinger");

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toMatch(/application\/json/);
      expect(res.body).toHaveProperty("warning");
      expect(res.body).toHaveProperty("live_sensors");
      expect(Array.isArray(res.body.live_sensors)).toBe(true);
    });

    it("should return analysis results when upstream is available", async () => {
      const mockConfig = { devices: [{ source: "dev1", "ip-address": "192.168.1.10" }] };
      const fetchMock = createMockFetch(mockConfig);
      const app = createTestApp(fetchMock);

      const res = await request(app).get("/ippinger/analyze-ippinger");

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });
});
