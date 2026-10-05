/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import express from "express";
import request from "supertest";
import type { z } from "zod";

import { CreateMiddleware } from "../../../src/middleware/middleware";
import { CreateGeneralRoutes } from "../../../src/routes/generalRoutes";
import { validateConfig, type configSchema } from "../../../src/schemas/config";
import { createMockMqttNetworking } from "../../mocks/mqtt";
import { createMockReq, createMockRes } from "../../mocks/express";

// Integration coverage for the global body-validation middleware.
//
// The route tests under tests/__tests__/routes/ build their apps with
// `express.json()` but WITHOUT the real CreateMiddleware, so they never
// exercise the body-validation step. This test installs the actual
// CreateMiddleware exactly as src/index.ts does, so it runs the same
// cors → json → rate-limit → request-id → logger → body-validation pipeline
// a real request walks through.
//
// Note on the no-body path: `express.json()` (body-parser) always sets
// `req.body = {}` minimum, so a bodyless GET arrives here as an empty object,
// never undefined. These tests pin that bodyless GETs reach their handlers
// (and that a body-requiring route still owns its own 400), so a future change
// that starts rejecting empty/missing bodies at this layer would be caught.
const config: z.infer<typeof configSchema> = validateConfig({
    "log-level": "info",
    "express-port": 32000,
    "mqtt-broker-ip-address": "10.10.10.64",
    "mqtt-topic-telemetry": "iot/v3/telemetry",
    "mqtt-topic-command": "iot/v3/command",
    "mqtt-topic-command-response": "iot/v3/command-response",
    "ip-pinger-web-api": "http://10.10.10.50:3300",
    "case-sensitive": true,
    "db-host": "10.10.10.64",
    "db-port": 5432,
    "db-name": "sensor_web_services",
    "db-user": "appuser",
    "db-password": "testpass",
});

// Build the production-equivalent stack: the real middleware first, then a few
// synthetic routes (so we can observe exactly what the middleware did to
// req.body) and the real GET routes after.
function buildApp(): express.Application {
    const app = express();
    new CreateMiddleware(app, config);

    // Echoes back the (validated) body — proves a valid object body reached the
    // route handler intact, with req.body replaced by the parsed object.
    app.post("/echo", (req: express.Request, res: express.Response) => {
        res.status(200).json(req.body);
    });

    // Enforces its OWN "body required" contract — proves that, now that the
    // middleware no longer does, a route that needs a body still gets a
    // bodyless request and can reject it on its own terms.
    app.post("/requires-body", (req: express.Request, res: express.Response) => {
        const body = req.body;
        const empty =
            body === undefined ||
            body === null ||
            (typeof body === "object" && Object.keys(body).length === 0);
        if (empty) {
            res.status(400).json({ error: "request body is required" });
            return;
        }
        res.status(200).json({ ok: true });
    });

    new CreateGeneralRoutes(app, createMockMqttNetworking());
    return app;
}

describe("CreateMiddleware — global body validation", () => {
    let app: express.Application;

    beforeEach(() => {
        app = buildApp();
    });

    describe("bodyless GET requests reach their handlers", () => {
        it("lets GET /health reach its handler (200)", async () => {
            const res = await request(app).get("/health");
            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty("status");
        });

        it("lets GET /about reach its handler (200)", async () => {
            const res = await request(app).get("/about");
            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty("about");
        });

        it("lets GET /date_local reach its handler (200)", async () => {
            const res = await request(app).get("/date_local");
            expect(res.status).toBe(200);
        });

        it("lets GET /metrics reach its handler (200)", async () => {
            const res = await request(app).get("/metrics");
            expect(res.status).toBe(200);
            expect(res.text).toContain("http_requests_total");
        });
    });

    describe("requests that do carry a body", () => {
        it("passes a valid JSON object body through to the route", async () => {
            const res = await request(app).post("/echo").send({ theme: "dark" });
            expect(res.status).toBe(200);
            expect(res.body).toEqual({ theme: "dark" });
        });

        // A JSON array is valid JSON, so it clears express.json() and reaches
        // THIS middleware — which rejects it because the body is not a plain
        // object. (Top-level string/number bodies are covered by the direct
        // tests below and at the schema level in schemas/postBody.test.ts; they
        // are awkward to drive through supertest because of client-side string
        // encoding, not this middleware.)
        it("rejects an array body with 400", async () => {
            const res = await request(app).post("/echo").send([1, 2, 3]);
            expect(res.status).toBe(400);
            expect(res.body.error).toBe("request body must be a JSON object");
        });
    });

    describe("routes that require a body", () => {
        it("lets a body-requiring route return its own 400 when no body is sent", async () => {
            const res = await request(app).post("/requires-body");
            expect(res.status).toBe(400);
            expect(res.body.error).toBe("request body is required");
        });

        it("lets a body-requiring route succeed when a body is present", async () => {
            const res = await request(app).post("/requires-body").send({ a: 1 });
            expect(res.status).toBe(200);
            expect(res.body).toEqual({ ok: true });
        });
    });

    // The no-body (undefined/null) branch and top-level string/number bodies
    // cannot be reached through the supertest stack, because `express.json()`
    // (mounted by CreateMiddleware) normalizes an empty body to `{}` before this
    // middleware runs. Drive _validateBodyMiddleware directly to pin the exact
    // behavior the production change introduced: a missing body is passed
    // through (never 400'd here), while a present non-object body is rejected.
    describe("_validateBodyMiddleware — direct (unreachable via express.json)", () => {
        // The class exposes no public seam for this, so the test reaches the
        // method directly. The throwaway app is discarded; only the bound
        // method is exercised.
        function middlewareUnderTest(): {
            _validateBodyMiddleware: (
                req: express.Request,
                res: express.Response,
                next: express.NextFunction
            ) => void;
        } {
            return new CreateMiddleware(express(), config) as unknown as {
                _validateBodyMiddleware: (
                    req: express.Request,
                    res: express.Response,
                    next: express.NextFunction
                ) => void;
            };
        }

        it("passes through a missing (undefined) body without responding", () => {
            const { res, statusCalls, sendCalls } = createMockRes();
            const req = createMockReq({ body: undefined }) as express.Request;
            let nextCalled = false;

            middlewareUnderTest()._validateBodyMiddleware(req, res as express.Response, () => { nextCalled = true; });

            expect(nextCalled).toBe(true);
            expect(statusCalls).toEqual([]);
            expect(sendCalls).toEqual([]);
        });

        it("passes through a missing (null) body without responding", () => {
            const { res, statusCalls, sendCalls } = createMockRes();
            const req = createMockReq({ body: null }) as express.Request;
            let nextCalled = false;

            middlewareUnderTest()._validateBodyMiddleware(req, res as express.Response, () => { nextCalled = true; });

            expect(nextCalled).toBe(true);
            expect(statusCalls).toEqual([]);
            expect(sendCalls).toEqual([]);
        });

        it("rejects a present top-level string body with 400", () => {
            const { res, statusCalls, sendCalls } = createMockRes();
            const req = createMockReq({ body: "just a string" }) as express.Request;
            let nextCalled = false;

            middlewareUnderTest()._validateBodyMiddleware(req, res as express.Response, () => { nextCalled = true; });

            expect(nextCalled).toBe(false);
            expect(statusCalls).toEqual([400]);
            expect(sendCalls).toEqual([{ error: "request body must be a JSON object" }]);
        });

        it("replaces req.body with the validated object and passes through", () => {
            const { res, statusCalls, sendCalls } = createMockRes();
            const req = createMockReq({ body: { theme: "dark" } }) as express.Request;
            let nextCalled = false;

            middlewareUnderTest()._validateBodyMiddleware(req, res as express.Response, () => { nextCalled = true; });

            expect(nextCalled).toBe(true);
            expect(statusCalls).toEqual([]);
            expect(sendCalls).toEqual([]);
            expect(req.body).toEqual({ theme: "dark" });
        });
    });
});

describe("CreateMiddleware — rate-limit exemption for /health and /metrics (P2-4)", () => {
    // A fresh app per test (each CreateMiddleware builds its own in-memory
    // rate limiter), with a tight limit (2) so we can exhaust it quickly.
    function buildLimitedApp(): express.Application {
        const limitedConfig = validateConfig({
            ...config,
            "rate-limit-window-ms": 60_000,
            "rate-limit-max": 2,
        });
        const app = express();
        new CreateMiddleware(app, limitedConfig);
        new CreateGeneralRoutes(app, createMockMqttNetworking());
        return app;
    }

    it("rate-limits a normal route (max 2 -> the 3rd request is 429)", async () => {
        const app = buildLimitedApp();
        const r1 = await request(app).get("/about");
        const r2 = await request(app).get("/about");
        const r3 = await request(app).get("/about");
        expect(r1.status).toBe(200);
        expect(r2.status).toBe(200);
        expect(r3.status).toBe(429);
    });

    it("/health is exempt: still 200 after the limit is exhausted", async () => {
        const app = buildLimitedApp();
        await request(app).get("/about"); // 1st
        await request(app).get("/about"); // 2nd -> limit reached
        const about429 = await request(app).get("/about"); // 3rd -> 429
        expect(about429.status).toBe(429);
        const health = await request(app).get("/health"); // exempt -> 200
        expect(health.status).toBe(200);
        expect(health.body).toHaveProperty("status");
    });

    it("/metrics is exempt: still 200 after the limit is exhausted", async () => {
        const app = buildLimitedApp();
        await request(app).get("/about");
        await request(app).get("/about");
        const about429 = await request(app).get("/about");
        expect(about429.status).toBe(429);
        const metrics = await request(app).get("/metrics"); // exempt -> 200
        expect(metrics.status).toBe(200);
        expect(metrics.text).toContain("http_requests_total");
    });
});
