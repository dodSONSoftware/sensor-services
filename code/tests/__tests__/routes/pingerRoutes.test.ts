/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import request from "supertest";
import express from "express";
import { CreatePingerRoutes } from "../../../src/routes/pingerRoutes";
import { createMockMqttNetworking } from "../../mocks/mqtt";

const MOCK_PINGER_API = "http://192.168.1.4:32001";
const MOCK_FETCH_TIMEOUT_MS = 10_000;
const MOCK_PINGER_TOKEN = "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6";

// Mock fetch for all pinger route tests (they proxy to an external service)
const originalFetch = global.fetch;

function createMockFetch(response: unknown, status: number = 200) {
  return jest.fn().mockResolvedValue({
    ok: true,
    status,
    json: jest.fn().mockResolvedValue(response),
  });
}

function createTestApp(fetchMock?: jest.Mock, configToken?: string): express.Application {
  const app = express();
  app.use(express.json());
  const networking = createMockMqttNetworking();
  const pingerRoutes = new CreatePingerRoutes(
    app,
    networking,
    MOCK_PINGER_API,
    true,
    MOCK_FETCH_TIMEOUT_MS,
    configToken
  );
  pingerRoutes.register();
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

  describe("GET /sensors/ippinger-analyze", () => {
    it("should return 200 with warning when upstream is unavailable", async () => {
      // fetch rejects for the ippinger read-config call, but mqtt get-details succeeds (mocked)
      jest.spyOn(global, "fetch").mockRejectedValue(new Error("ENOTFOUND"));
      const app = createTestApp();

      const res = await request(app).get("/sensors/ippinger-analyze");

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

      const res = await request(app).get("/sensors/ippinger-analyze");

      expect(res.status).toBe(200);
      expect(typeof res.body).toBe('object');
      expect(Array.isArray(res.body)).toBe(true);
    });

    it("should send the configured ip-pinger-config-token as the x-config-token header", async () => {
      const mockConfig = { devices: [{ source: "dev1", "ip-address": "192.168.1.10" }] };
      const fetchMock = createMockFetch(mockConfig);
      const app = createTestApp(fetchMock, MOCK_PINGER_TOKEN);

      const res = await request(app).get("/sensors/ippinger-analyze");

      expect(res.status).toBe(200);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${MOCK_PINGER_API}/read-config`);
      expect((init?.headers as Record<string, string>)["x-config-token"]).toBe(MOCK_PINGER_TOKEN);
    });

    it("should omit the x-config-token header when no token is configured", async () => {
      const mockConfig = { devices: [{ source: "dev1", "ip-address": "192.168.1.10" }] };
      const fetchMock = createMockFetch(mockConfig);
      const app = createTestApp(fetchMock);

      const res = await request(app).get("/sensors/ippinger-analyze");

      expect(res.status).toBe(200);
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit | undefined];
      expect((init?.headers ?? {}) as Record<string, string>).not.toHaveProperty("x-config-token");
    });
  });
});
