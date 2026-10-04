/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import type { Request, Response } from "express";
import { getAbout, getDateCurrent, getDateUTC, getHealth } from "../../../src/controllers/generalController";
import { createMockRes, createMockReq } from "../../mocks/express";
import { setConfig } from "../../../src/common/global";

/**
 * Create a mock fetch response that resolves with a successful HTTP response.
 */
function createMockFetchResponse(status: string = "healthy"): Response {
  return {
    ok: true,
    status: 200,
    json: jest.fn().mockResolvedValue({ status }),
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
  } as Response;
}

afterEach(() => {
  // Restore original fetch after each test
  jest.restoreAllMocks();
  // Clear config after each test
  setConfig(undefined);
});

describe("getAbout", () => {
  it("should return IAbout JSON with OK status", async () => {
    const { res, statusCalls, contentTypeCalls, sendCalls } = createMockRes();
    const req = createMockReq() as Request;

    await getAbout(req, res as Response);

    expect(statusCalls).toContain(200);
    expect(contentTypeCalls).toContain("application/json");
    expect(sendCalls).toHaveLength(1);
    const body = sendCalls[0] as Record<string, unknown>;
    expect(body).toHaveProperty("about");
    expect(body.about).toHaveProperty("name");
    expect(body.about).toHaveProperty("version");
    expect(body.system).toHaveProperty("status");
    expect(body.system).toHaveProperty("mqtt");
    expect(body.system).toHaveProperty("ipPinger");
    expect(body.system).toHaveProperty("sensorTelemetry");
    expect(body.system).toHaveProperty("bootdate");
  });
});

describe("getDateCurrent", () => {
  it("should return a formatted local date string", () => {
    const { res, statusCalls, contentTypeCalls, sendCalls } = createMockRes();
    const req = createMockReq() as Request;

    getDateCurrent(req, res as Response);

    expect(statusCalls).toContain(200);
    expect(contentTypeCalls).toContain("text/plain");
    expect(sendCalls).toHaveLength(1);
    const dateStr = sendCalls[0] as string;
    expect(dateStr).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
  });

  // Regression: Date#getMonth() is zero-based (January = 0); the formatter
  // must emit one-based calendar months. Assert the exact complete response.
  describe("with frozen time", () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    it("should return January as month 01, not 00", () => {
      jest.useFakeTimers();
      // Local-time construction keeps the assertion TZ-independent
      jest.setSystemTime(new Date(2026, 0, 15, 12, 34, 56));

      const { res, sendCalls } = createMockRes();
      getDateCurrent(createMockReq() as Request, res as Response);

      expect(sendCalls[0]).toBe("2026-01-15T12:34:56");
    });

    it("should return October as month 10, not 09", () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date(2026, 9, 3, 0, 5, 9));

      const { res, sendCalls } = createMockRes();
      getDateCurrent(createMockReq() as Request, res as Response);

      expect(sendCalls[0]).toBe("2026-10-03T00:05:09");
    });

    it("should return December 31 as month 12", () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date(2026, 11, 31, 23, 59, 59));

      const { res, sendCalls } = createMockRes();
      getDateCurrent(createMockReq() as Request, res as Response);

      expect(sendCalls[0]).toBe("2026-12-31T23:59:59");
    });
  });
});

describe("getDateUTC", () => {
  it("should return a formatted UTC date string", () => {
    const { res, statusCalls, contentTypeCalls, sendCalls } = createMockRes();
    const req = createMockReq() as Request;

    getDateUTC(req, res as Response);

    expect(statusCalls).toContain(200);
    expect(contentTypeCalls).toContain("text/plain");
    expect(sendCalls).toHaveLength(1);
    const dateStr = sendCalls[0] as string;
    expect(dateStr).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });
});

describe("getHealth", () => {
  beforeEach(() => {
    // Set up a minimal config for health checks
    setConfig({
      "log-level": "debug",
      "express-port": 32000,
      "prometheus-port": 3301,
      "mqtt-broker-ip-address": "10.10.10.64",
      "mqtt-topic-telemetry": "iot/telemetry",
      "mqtt-topic-command": "iot/v2/command",
      "mqtt-topic-command-response": "iot/v2/command-response",
      "ip-pinger-web-api": "http://10.10.10.64:3300",
      "case-sensitive": true,
      "db-host": "localhost",
      "db-port": 5432,
      "db-name": "sensor_db",
      "db-user": "sensor_user",
      "db-password": "sensor_pass",
    });
  });

  it("should return health object with MQTT check when connected", async () => {
    const { res, statusCalls, contentTypeCalls, sendCalls } = createMockRes();
    const req = createMockReq({
      mqtt_connected: true,
    }) as Request & { mqtt_connected: boolean };

    // Mock successful responses for both IP Pinger and Sensor Telemetry
    jest.spyOn(global, "fetch").mockResolvedValue(createMockFetchResponse());

    await getHealth(req, res as Response);

    expect(statusCalls).toContain(200);
    expect(contentTypeCalls).toContain("application/json");
    expect(sendCalls).toHaveLength(1);
    const body = sendCalls[0] as Record<string, unknown>;
    expect(body).toHaveProperty("status");
    expect(body.status).toBe("healthy");
    expect(body).toHaveProperty("mqtt");
    expect(body.mqtt).toBe("connected");
    expect(body).toHaveProperty("ipPinger");
    expect(body.ipPinger).toBe("healthy");
    expect(body).toHaveProperty("sensorTelemetry");
    expect(body.sensorTelemetry).toBe("healthy");
    expect(body).toHaveProperty("timestamp");
  });

  it("should report unhealthy status with HTTP 503 when mqtt is not connected", async () => {
    const { res, statusCalls, sendCalls } = createMockRes();
    const req = createMockReq({
      mqtt_connected: false,
    }) as Request & { mqtt_connected: boolean };

    jest.spyOn(global, "fetch").mockResolvedValue(createMockFetchResponse());

    await getHealth(req, res as Response);

    // Unhealthy must surface to orchestration: curl -f healthchecks only
    // fail on HTTP error status codes
    expect(statusCalls).toContain(503);
    const body = sendCalls[0] as Record<string, unknown>;
    expect(body.status).toBe("unhealthy");
    expect(body.mqtt).toBe("disconnected");
    expect(body.ipPinger).toBe("healthy");
    expect(body.sensorTelemetry).toBe("healthy");
  });

  it("should mark ipPinger as unreachable when fetch fails", async () => {
    const { res, statusCalls, sendCalls } = createMockRes();
    const req = createMockReq({
      mqtt_connected: true,
    }) as Request & { mqtt_connected: boolean };

    // Use separate mock implementations for each call
    // IP Pinger (/health) fails, telemetry (/health) succeeds
    const mockFetch = jest.fn();
    mockFetch.mockImplementationOnce((url: string) => {
      if (url.includes("/health")) {
        return Promise.reject(new Error("IP Pinger unavailable"));
      }
      return Promise.resolve(createMockFetchResponse());
    });

    jest.spyOn(global, "fetch").mockImplementation(mockFetch);

    await getHealth(req, res as Response);

    // Degraded stays HTTP 200 — non-critical dependency failures are visible
    // in the body without failing the container healthcheck
    expect(statusCalls).toContain(200);
    const body = sendCalls[0] as Record<string, unknown>;
    expect(body.status).toBe("degraded");
    expect(body.mqtt).toBe("connected");
    expect(body.ipPinger).toBe("unreachable");
    expect(body.sensorTelemetry).toBe("healthy");
  });

  it("should handle missing config gracefully", async () => {
    const { res, sendCalls } = createMockRes();
    const req = createMockReq({
      mqtt_connected: true,
    }) as Request & { mqtt_connected: boolean };

    // Clear config
    setConfig(undefined);

    jest.spyOn(global, "fetch").mockResolvedValue(createMockFetchResponse());

    await getHealth(req, res as Response);

    const body = sendCalls[0] as Record<string, unknown>;
    // When config is missing, health checks are skipped (default to healthy)
    expect(body.status).toBe("healthy");
    expect(body.mqtt).toBe("connected");
    expect(body.ipPinger).toBe("healthy");
    expect(body.sensorTelemetry).toBe("healthy");
  });
});
