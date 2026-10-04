/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import request from "supertest";
import express from "express";
import {
    apiMetricsRegistry,
    createApiMetricsMiddleware,
} from "../../../src/common/metrics";

describe("API metrics middleware (route label)", () => {
    function createMetricsApp(): express.Application {
        const app = express();
        app.use(createApiMetricsMiddleware());

        // A matched route — its label must remain the route pattern
        app.get("/sensors/get-details", (_req, res) => {
            res.status(200).json([]);
        });

        // Scrape endpoint (served from the same registry the middleware records to)
        app.get("/metrics", async (_req, res) => {
            res.status(200).type("text/plain").send(await apiMetricsRegistry.metrics());
        });

        return app;
    }

    it("should collapse unmatched routes to the 'unmatched' sentinel", async () => {
        const app = createMetricsApp();

        // Unique nonexistent paths — with the raw path as label value these
        // would each create their own unbounded Prometheus series
        const randomPaths = ["/random-a-1", "/random-b-2", "/random-c-3"];
        for (const p of randomPaths) {
            const res = await request(app).get(p);
            expect(res.status).toBe(404);
        }

        const body = (await request(app).get("/metrics")).text;

        // The sentinel is present, tagged by method and status
        expect(body).toMatch(/http_requests_total\{[^}]*method="GET"[^}]*route="unmatched"[^}]*status="404"[^}]*\}/);
        expect(body).toMatch(/http_request_duration_seconds_bucket\{[^}]*route="unmatched"[^}]*\}/);

        // No raw random path ever appears as a route label value
        for (const p of randomPaths) {
            expect(body).not.toContain(`route="${p}"`);
        }
    });

    it("should keep the matched route pattern as the route label", async () => {
        const app = createMetricsApp();

        const res = await request(app).get("/sensors/get-details");
        expect(res.status).toBe(200);

        const body = (await request(app).get("/metrics")).text;
        expect(body).toMatch(/http_requests_total\{[^}]*method="GET"[^}]*route="\/sensors\/get-details"[^}]*status="200"[^}]*\}/);
    });
});
