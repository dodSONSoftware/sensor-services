/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import type { Request, Response } from "express";
import { getAbout, getDateCurrent, getDateUTC, getHealth, getReady } from "../../../src/controllers/generalController";
import { createMockRes, createMockReq } from "../../mocks/express";

describe("getAbout", () => {
  it("should return IAbout JSON with OK status", () => {
    const { res, statusCalls, contentTypeCalls, sendCalls } = createMockRes();
    const req = createMockReq() as Request;

    getAbout(req, res as Response);

    expect(statusCalls).toContain(200);
    expect(contentTypeCalls).toContain("application/json");
    expect(sendCalls).toHaveLength(1);
    const body = sendCalls[0] as Record<string, unknown>;
    expect(body).toHaveProperty("about");
    expect(body.about).toHaveProperty("name");
    expect(body.about).toHaveProperty("version");
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
  it("should return health object with MQTT check when connected", () => {
    const { res, statusCalls, contentTypeCalls, sendCalls } = createMockRes();
    const req = createMockReq({
      mqtt_connected: true,
    }) as Request & { mqtt_connected: boolean };

    getHealth(req, res as Response);

    expect(statusCalls).toContain(200);
    expect(contentTypeCalls).toContain("application/json");
    expect(sendCalls).toHaveLength(1);
    const body = sendCalls[0] as Record<string, unknown>;
    expect(body).toHaveProperty("status");
    expect(body.status).toBe("ok");
    expect(body).toHaveProperty("service");
    expect(body).toHaveProperty("version");
    expect(body).toHaveProperty("mqtt");
    expect(body.mqtt).toBe("connected");
    expect(body).toHaveProperty("uptime_seconds");
    expect(typeof body.uptime_seconds).toBe("number");
    expect(body).toHaveProperty("timestamp");
    expect(body).toHaveProperty("memory");
    expect(body.memory).toHaveProperty("rss");
    expect(body.memory).toHaveProperty("heap_used");
    expect(body.memory).toHaveProperty("heap_total");
    expect(body).toHaveProperty("cpu");
    expect(body.cpu).toHaveProperty("load_1min");
    expect(body.cpu).toHaveProperty("load_5min");
    expect(body.cpu).toHaveProperty("load_15min");
    expect(typeof (body.cpu as Record<string, unknown>).load_1min).toBe("number");
    expect(typeof (body.cpu as Record<string, unknown>).load_5min).toBe("number");
    expect(typeof (body.cpu as Record<string, unknown>).load_15min).toBe("number");
  });

  it("should report degraded when mqtt is disconnected", () => {
    const { res, sendCalls } = createMockRes();
    const req = createMockReq({
      mqtt_connected: false,
    }) as Request & { mqtt_connected: boolean };

    getHealth(req, res as Response);

    const body = sendCalls[0] as Record<string, unknown>;
    expect(body.status).toBe("degraded");
    expect(body.mqtt).toBe("disconnected");
  });
});

describe("getReady", () => {
  it("should return 200 with status ready when all subsystems are ready", () => {
    const { res, statusCalls, contentTypeCalls, sendCalls } = createMockRes();
    const req = createMockReq({
      mqtt_connected: true,
      ippinger_reachable: true,
    }) as Request & { mqtt_connected: boolean; ippinger_reachable: boolean };

    getReady(req, res as Response);

    expect(statusCalls).toContain(200);
    expect(contentTypeCalls).toContain("application/json");
    expect(sendCalls).toHaveLength(1);
    const body = sendCalls[0] as Record<string, unknown>;
    expect(body.status).toBe("ready");
    expect(body.dependencies.mqtt).toBe("connected");
    expect(body.dependencies.ippinger).toBe("ready");
  });

  it("should return 503 with status not_ready when MQTT is disconnected", () => {
    const { res, statusCalls, sendCalls } = createMockRes();
    const req = createMockReq({
      mqtt_connected: false,
      ippinger_reachable: true,
    }) as Request & { mqtt_connected: boolean; ippinger_reachable: boolean };

    getReady(req, res as Response);

    expect(statusCalls).toContain(503);
    const body = sendCalls[0] as Record<string, unknown>;
    expect(body.status).toBe("not_ready");
    expect(body.dependencies.mqtt).toBe("disconnected");
  });

  it("should return 200 with status diminished when only IP pinger is unreachable", () => {
    const { res, statusCalls, contentTypeCalls, sendCalls } = createMockRes();
    const req = createMockReq({
      mqtt_connected: true,
      ippinger_reachable: false,
    }) as Request & { mqtt_connected: boolean; ippinger_reachable: boolean };

    getReady(req, res as Response);

    expect(statusCalls).toContain(200);
    expect(contentTypeCalls).toContain("application/json");
    const body = sendCalls[0] as Record<string, unknown>;
    expect(body.status).toBe("diminished");
    expect(body.dependencies.mqtt).toBe("connected");
    expect(body.dependencies.ippinger).toBe("not_ready");
  });

  it("should return 503 with status not_ready when all dependencies are down", () => {
    const { res, statusCalls, sendCalls } = createMockRes();
    const req = createMockReq({
      mqtt_connected: false,
      ippinger_reachable: false,
    }) as Request & { mqtt_connected: boolean; ippinger_reachable: boolean };

    getReady(req, res as Response);

    expect(statusCalls).toContain(503);
    const body = sendCalls[0] as Record<string, unknown>;
    expect(body.status).toBe("not_ready");
    expect(body.dependencies.mqtt).toBe("disconnected");
    expect(body.dependencies.ippinger).toBe("not_ready");
  });

  it("should return 503 with status not_ready when MQTT is down but IP pinger is up", () => {
    const { res, statusCalls, sendCalls } = createMockRes();
    const req = createMockReq({
      mqtt_connected: false,
      ippinger_reachable: true,
    }) as Request & { mqtt_connected: boolean; ippinger_reachable: boolean };

    getReady(req, res as Response);

    expect(statusCalls).toContain(503);
    const body = sendCalls[0] as Record<string, unknown>;
    expect(body.status).toBe("not_ready");
    expect(body.dependencies.mqtt).toBe("disconnected");
    expect(body.dependencies.ippinger).toBe("ready");
  });
});
