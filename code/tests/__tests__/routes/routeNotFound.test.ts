/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import request from "supertest";
import express from "express";
import { logger, setLogger } from "../../../src/common/global";
import { CreateRouteNotFound } from "../../../src/routes/routeNotFound";

function createTestApp(): express.Application {
  const app = express();
  app.use(express.json());
  new CreateRouteNotFound(app);
  return app;
}

describe("Route Not Found (404)", () => {
  it("should return 404 for any unmatched route", async () => {
    const app = createTestApp();

    const res = await request(app).get("/this-route-does-not-exist");

    expect(res.status).toBe(404);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toBe("The requested resource was not found.");
  });

  it("should return 404 for POST to any unmatched route", async () => {
    const app = createTestApp();

    const res = await request(app).post("/also/does/not/exist");

    expect(res.status).toBe(404);
    expect(res.body.message).toBe("The requested resource was not found.");
  });

  it("should return 404 for PUT to any unmatched route", async () => {
    const app = createTestApp();

    const res = await request(app).put("/another/fake/route");

    expect(res.status).toBe(404);
  });

  it("should return 404 even when logger is not initialized", async () => {
    const savedLogger = logger();

    setLogger(undefined as any);

    try {
      const app = createTestApp();

      const res = await request(app).get("/nonexistent-without-logger");

      expect(res.status).toBe(404);
      expect(res.body.message).toBe("The requested resource was not found.");
    } finally {
      setLogger(savedLogger);
    }
  });
});

describe("Route Not Found (404) — log severity (P3-3)", () => {
  // A 404 is client behavior, not a server failure: it must be logged at
  // warn (not error) so it stays visible without polluting error-level alerts.
  it("logs an unmatched route at warn, never at error", async () => {
    const savedLogger = logger();
    const write_error = jest.fn();
    const write_warn = jest.fn();
    // Only the two severities under test need stubbing; the handler calls
    // exactly one of them.
    setLogger({ write_error, write_warn } as any);

    try {
      const app = createTestApp();
      const res = await request(app).get("/definitely-not-a-real-route");

      // Response behavior is unchanged.
      expect(res.status).toBe(404);
      expect(res.body.message).toBe("The requested resource was not found.");

      // No error-level log is emitted for a normal 404.
      expect(write_error).not.toHaveBeenCalled();

      // The lower-severity (warn) log IS emitted, naming the request.
      expect(write_warn).toHaveBeenCalledTimes(1);
      const [originator, message] = write_warn.mock.calls[0];
      expect(originator).toBe("CreateRouteNotFound.ts/routeNotFound");
      expect(message).toContain("GET /definitely-not-a-real-route");
      expect(message).toContain("Route not found.");
    } finally {
      setLogger(savedLogger);
    }
  });
});
