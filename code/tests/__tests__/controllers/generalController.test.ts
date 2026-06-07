import type { Request, Response } from "express";
import { getAbout, getDateCurrent, getDateUTC, getHealth } from "../../../src/controllers/generalController";
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
  it("should return health object with all dependency checks when connected", () => {
    const { res, statusCalls, contentTypeCalls, sendCalls } = createMockRes();
    const req = createMockReq({
      mqtt_connected: true,
      prometheus_server_ready: true,
    }) as Request & { mqtt_connected: boolean; prometheus_server_ready: boolean };

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
    expect(body).toHaveProperty("prometheus_server");
    expect(body.prometheus_server).toBe("ready");
    expect(body).toHaveProperty("uptime_seconds");
    expect(typeof body.uptime_seconds).toBe("number");
    expect(body).toHaveProperty("timestamp");
    expect(body).toHaveProperty("memory");
    expect(body.memory).toHaveProperty("rss");
    expect(body.memory).toHaveProperty("heap_used");
    expect(body.memory).toHaveProperty("heap_total");
    expect(body).toHaveProperty("cpu");
    expect(body.cpu).toHaveProperty("load");
    expect(typeof (body.cpu as Record<string, unknown>).load).toBe("number");
  });

  it("should report degraded when mqtt is disconnected", () => {
    const { res, sendCalls } = createMockRes();
    const req = createMockReq({
      mqtt_connected: false,
      prometheus_server_ready: true,
    }) as Request & { mqtt_connected: boolean; prometheus_server_ready: boolean };

    getHealth(req, res as Response);

    const body = sendCalls[0] as Record<string, unknown>;
    expect(body.status).toBe("degraded");
    expect(body.mqtt).toBe("disconnected");
  });

  it("should report degraded when prometheus server is not ready", () => {
    const { res, sendCalls } = createMockRes();
    const req = createMockReq({
      mqtt_connected: true,
      prometheus_server_ready: false,
    }) as Request & { mqtt_connected: boolean; prometheus_server_ready: boolean };

    getHealth(req, res as Response);

    const body = sendCalls[0] as Record<string, unknown>;
    expect(body.status).toBe("degraded");
    expect(body.prometheus_server).toBe("not_ready");
  });

  it("should report degraded when both dependencies are down", () => {
    const { res, sendCalls } = createMockRes();
    const req = createMockReq({
      mqtt_connected: false,
      prometheus_server_ready: false,
    }) as Request & { mqtt_connected: boolean; prometheus_server_ready: boolean };

    getHealth(req, res as Response);

    const body = sendCalls[0] as Record<string, unknown>;
    expect(body.status).toBe("degraded");
    expect(body.mqtt).toBe("disconnected");
    expect(body.prometheus_server).toBe("not_ready");
  });
});
