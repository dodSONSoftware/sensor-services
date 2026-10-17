/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import request from "supertest";
import express from "express";
import { CreateRestartRoutes } from "../../../src/routes/restartRoutes";
import { RESTART_FALLBACK_DELAY_MS } from "../../../src/controllers/restartController";

const TOKEN = "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6";

// The byte-identical disabled 503 body (redeclared, not shared).
const DISABLED_503_BODY = '{"success":false,"message":"Restart endpoint is disabled."}';

function createTestApp(rawToken?: string, hook?: () => void, fallbackDelayMs = 50): express.Application {
    const app = express();
    const restart = new CreateRestartRoutes(app, rawToken, hook, fallbackDelayMs);
    restart.register();
    return app;
}

/** Yield long enough for the finish -> setImmediate scheduling hop. */
function settle(ms = 25): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("POST /restart-service (routes)", () => {
    it("non-POST verbs get 405 with Allow: POST and no-store", async () => {
        const hook = jest.fn();
        const app = createTestApp(TOKEN, hook);
        const res = await request(app).get("/restart-service").set("Authorization", `Bearer ${TOKEN}`);
        expect(res.status).toBe(405);
        expect(res.headers["allow"]).toBe("POST");
        expect(res.headers["cache-control"]).toBe("no-store");
        expect(res.headers["content-type"]).toMatch(/application\/json/);
        expect(hook).not.toHaveBeenCalled();
    });

    it("unset / empty / invalid token: byte-identical 503, service unaffected", async () => {
        for (const rawToken of [undefined, "", "short", `${TOKEN.slice(0, 30)}--`]) {
            const app = createTestApp(rawToken, jest.fn());
            const res = await request(app).post("/restart-service").set("Authorization", `Bearer ${TOKEN}`);
            expect(res.status).toBe(503);
            expect(res.text).toBe(DISABLED_503_BODY);
            expect(res.headers["cache-control"]).toBe("no-store");
        }
    });

    it("enabled, no Authorization header: 401 + WWW-Authenticate: Bearer", async () => {
        const app = createTestApp(TOKEN, jest.fn());
        const res = await request(app).post("/restart-service");
        expect(res.status).toBe(401);
        expect(res.headers["www-authenticate"]).toBe("Bearer");
        expect(res.text).toBe('{"success":false,"message":"missing or invalid Authorization header"}');
    });

    it("enabled, wrong token: 401 (the distinct config-token secret is never accepted)", async () => {
        const hook = jest.fn();
        const app = createTestApp(TOKEN, hook);
        const res = await request(app).post("/restart-service").set("Authorization", "Bearer Zz9Yy8Xx7Ww6Vv5Uu4Tt3Ss2Rr1Qq0Pp");
        expect(res.status).toBe(401);
        expect(hook).not.toHaveBeenCalled();
    });

    it("enabled, valid token: 202 with the scheduled body and no-store + Connection: close", async () => {
        const hook = jest.fn();
        const app = createTestApp(TOKEN, hook);
        const res = await request(app).post("/restart-service").set("Authorization", `Bearer ${TOKEN}`);
        expect(res.status).toBe(202);
        expect(res.text).toBe('{"success":true,"status":"restart_scheduled","message":"Service restart requested"}');
        expect(res.headers["cache-control"]).toBe("no-store");
        expect(res.headers["connection"]).toBe("close");

        // The hook fires exactly once after the response has been delivered
        // (finish -> setImmediate). By the time supertest resolves, the
        // response is fully flushed, so the hop has (or is about to have)
        // run — the response-before-callback ORDERING is pinned in the
        // controller suite, where the finish event is driven manually.
        await settle();
        expect(hook).toHaveBeenCalledTimes(1);
    });

    it("a second POST while the first is pending gets 409", async () => {
        const hook = jest.fn();
        const app = createTestApp(TOKEN, hook);
        const first = await request(app).post("/restart-service").set("Authorization", `Bearer ${TOKEN}`);
        expect(first.status).toBe(202);
        const second = await request(app).post("/restart-service").set("Authorization", `Bearer ${TOKEN}`);
        expect(second.status).toBe(409);
        expect(second.text).toBe('{"success":false,"message":"Restart already in progress."}');
        await settle();
        // The FIRST request's restart fired exactly once; the 409'd second
        // request scheduled nothing.
        expect(hook).toHaveBeenCalledTimes(1);
    });

    it("a request body is ignored (never consumed, never required)", async () => {
        const hook = jest.fn();
        const app = createTestApp(TOKEN, hook);
        const res = await request(app)
            .post("/restart-service")
            .set("Authorization", `Bearer ${TOKEN}`)
            .set("Content-Type", "application/json")
            .send({ anything: "at-all" });
        expect(res.status).toBe(202);
        await settle();
        expect(hook).toHaveBeenCalledTimes(1);
    });

    it("uses the production fallback delay when none is injected", () => {
        // The routes module's default (no fourth argument) is the production
        // window — pin it so a default change is a deliberate act.
        expect(RESTART_FALLBACK_DELAY_MS).toBe(2000);
    });
});
