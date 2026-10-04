/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import type express from "express";
import { Registry, Counter, Histogram } from "prom-client";
import { InternalServerError } from "../dodsonlabs/HttpConstants";

/**
 * Dedicated Prometheus registry for API-specific metrics.
 *
 * Separated from the global register used by PrometheusWriter (sensor gauges)
 * so API metrics can be scraped independently at /metrics on the main
 * Express app (port 32000) versus sensor metrics at /metrics on port 3301.
 */
export const apiMetricsRegistry: Registry = new Registry();

/** Total HTTP requests by method, route, and status code. */
export const httpRequestsTotal = new Counter({
    name: "http_requests_total",
    help: "Total number of HTTP requests.",
    labelNames: ["method", "route", "status"] as const,
    registers: [apiMetricsRegistry],
});

/** HTTP request duration in seconds by method and route. */
export const httpRequestDuration = new Histogram({
    name: "http_request_duration_seconds",
    help: "HTTP request duration in seconds.",
    labelNames: ["method", "route"] as const,
    buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [apiMetricsRegistry],
});

/** Total HTTP 5xx errors by method and route. */
export const httpErrorsTotal = new Counter({
    name: "http_errors_total",
    help: "Total number of HTTP 5xx errors.",
    labelNames: ["method", "route"] as const,
    registers: [apiMetricsRegistry],
});

// Route label for requests that never matched a registered route. The raw
// request path must never become a label value: it is client-controlled and
// unbounded, and prom-client retains every label combination it has seen —
// a new unique 404 path per request would grow memory and scrape size
// without limit.
const UNMATCHED_ROUTE = "unmatched";

/**
 * Express middleware that records API-level Prometheus metrics
 * (http_requests_total, http_request_duration_seconds, http_errors_total)
 * for every request. The route label is the matched route pattern
 * (e.g. /sensors/get-details/:source); unmatched requests collapse to the
 * single UNMATCHED_ROUTE sentinel (the method label still differentiates
 * GET unmatched / POST unmatched / ...).
 */
export function createApiMetricsMiddleware(): express.RequestHandler {
    return (req: express.Request, res: express.Response, next: express.NextFunction) => {
        const start = process.hrtime();

        // Wrap res.end to capture the final status code
        const originalEnd = res.end;
        const trackedRes = res as express.Response & { _ended?: boolean };
        trackedRes._ended = false;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        res.end = function (this: any, ...args: any[]) {
            if (!trackedRes._ended) {
                trackedRes._ended = true;

                const [sec, nsec] = process.hrtime(start);
                const duration = sec + nsec / 1e9;

                const method = req.method;
                // Use the matched route pattern (e.g., /sensors/get-details/:source)
                const route = req.route ? req.route.path : UNMATCHED_ROUTE;
                const status = res.statusCode;

                httpRequestsTotal.labels({ method, route, status }).inc();
                httpRequestDuration.labels({ method, route }).observe(duration);

                if (status >= InternalServerError) {
                    httpErrorsTotal.labels({ method, route }).inc();
                }
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (originalEnd as any).apply(this, args);
        } as typeof res.end;

        next();
    };
}
