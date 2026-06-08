/*
 * Copyright (c) 2025-2026 dodson Software ( dodson labs )
 * Author: Randy Dodson <dodsonsoftware@gmail.com>
 * Licensed under the MIT License with Patent Grant and NOTICE preservation.
 * See the LICENSE file for the full terms.
 */

import { Registry, Counter, Histogram } from "prom-client";

/**
 * Dedicated Prometheus registry for API-specific metrics.
 *
 * Separated from the global register used by PrometheusWriter (sensor gauges)
 * so API metrics can be scraped independently at /metrics/api on the main
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
