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
  it("should return health object with mqtt_connected from request", () => {
    const { res, statusCalls, contentTypeCalls, sendCalls } = createMockRes();
    const req = createMockReq({ mqtt_connected: true }) as Request & { mqtt_connected: boolean };

    getHealth(req, res as Response);

    expect(statusCalls).toContain(200);
    expect(contentTypeCalls).toContain("application/json");
    expect(sendCalls).toHaveLength(1);
    const body = sendCalls[0] as Record<string, unknown>;
    expect(body).toHaveProperty("status");
    expect(body).toHaveProperty("service");
    expect(body).toHaveProperty("version");
    expect(body).toHaveProperty("mqtt");
    expect(body.mqtt).toBe("connected");
    expect(body).toHaveProperty("uptime_seconds");
    expect(typeof body.uptime_seconds).toBe("number");
    expect(body).toHaveProperty("timestamp");
  });

  it("should report disconnected when mqtt_connected is false", () => {
    const { res, sendCalls } = createMockRes();
    const req = createMockReq({ mqtt_connected: false }) as Request & { mqtt_connected: boolean };

    getHealth(req, res as Response);

    const body = sendCalls[0] as Record<string, unknown>;
    expect(body.mqtt).toBe("disconnected");
  });
});
