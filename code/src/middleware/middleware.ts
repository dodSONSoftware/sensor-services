/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import cors from "cors";
import * as express from "express";
import rateLimit from "express-rate-limit";
import { randomUUID } from "crypto";
import { RoutesCreatorBase } from "../dodsonlabs/CreatorBase";
import { _reqIdStore, logger } from "../common/global";
import { validatePostBody } from "../schemas/postBody";
import { Json } from "../dodsonlabs/HttpConstants";
import type { configSchema } from "../schemas/config";
import type { z } from "zod";
import type { AppRequest } from "../common/app-request";

// Module-level config reference — set in constructor before super() so
// createRoutes() (called from super()) can access it. Safe in Node.js (single-threaded).
let _config: z.infer<typeof configSchema>;

// Module-level metrics middleware reference — same reason as _config above:
// createRoutes() runs from super(), before any derived-class instance field
// (e.g. a `private` parameter property) has been assigned. Stored here so the
// optional API-metrics middleware can be installed at its (deliberately early)
// position in the chain.
let _metricsMiddleware: express.RequestHandler | undefined;

// **** public classes

export class CreateMiddleware extends RoutesCreatorBase {
    // **** ctor

    constructor(
        protected app: express.Application,
        config: z.infer<typeof configSchema>,
        // Optional API-metrics middleware (createApiMetricsMiddleware in
        // common/metrics.ts). Passed in by index.ts so it can be installed
        // AHEAD of the rate limiter — the order is what makes 429 responses
        // observable (P3-2). Tests that don't care about metrics omit it.
        metricsMiddleware?: express.RequestHandler
    ) {
        _config = config;
        _metricsMiddleware = metricsMiddleware;

        // ----
        super(app);
    }

    // **** protected functions

    protected createRoutes() {
        // Global middleware, in deliberate order (P3-2):
        //   1. request ID      -> every response (incl. 429) carries X-Request-ID
        //   2. HTTP metrics    -> wraps res.end, so it counts rate-limit 429s too
        //   3. CORS            -> before rate limiting (preflight stays unthrottled)
        //   4. rate limiter    -> before body parsing (an over-limit body is
        //                         rejected without being parsed)
        //   5. JSON body parser
        //   6. request logger
        //   7. body validation
        //
        // Metrics is installed here (rather than later in index.ts) precisely so
        // it sits ahead of the rate limiter and therefore observes 429 terminal
        // responses.

        // 1. request ID middleware — must run first so every response is
        //    traceable (and every log line has an ID, including rate-limited
        //    ones that terminate before the logger below).
        this.app.use(this._requestIdMiddleware.bind(this));

        // 2. HTTP metrics — before rate limiting so 429s are counted.
        if (_metricsMiddleware) {
            this.app.use(_metricsMiddleware);
        }

        // 3. add CORS
        this.app.use(cors());

        // 4. add rate limiting (configurable, default 100 requests per 15
        //    minutes). Runs BEFORE the JSON body parser (below) so an over-limit
        //    client's (potentially oversized) body is rejected without being
        //    parsed.
        const windowMs = _config["rate-limit-window-ms"] ?? 900_000;
        const max = _config["rate-limit-max"] ?? 100;
        this.app.use(rateLimit({
            windowMs,
            max,
            standardHeaders: true,
            legacyHeaders: false,
            message: { error: "too many requests, please try again later" },
            // /health and /metrics are scraped on a fixed cadence by the Docker
            // healthcheck and Prometheus. Exempt them so normal scrape load can
            // never 429 the container into "unhealthy" or drop metrics —
            // observability endpoints must stay available.
            skip: (req: express.Request) => req.path === "/health" || req.path === "/metrics",
        }));

        // 5. add JSON (configurable body limit, default 1mb) — after rate
        //    limiting, so a 429'd request's body is never parsed.
        const bodyLimit = _config["express-body-limit"] ?? "1mb";
        this.app.use(express.json({ limit: bodyLimit }));

        // 6. add request logger (request ID is already in AsyncLocalStorage)
        this.app.use(this._loggerMiddleware.bind(this));

        // 7. add body validation
        this.app.use(this._validateBodyMiddleware.bind(this));
    }

    // **** private functions

    /**
     * Validates that a present request body is a plain object using Zod.
     *
     * "A body is required" is a route-level concern owned by each controller
     * (e.g. configController's writeConfig), so this middleware validates a
     * body when one is present but never requires one: a request with no body
     * is passed through untouched. In the production stack `express.json()`
     * (mounted earlier) already normalizes an empty body to `{}`, so this
     * no-body branch is a defensive guard for the case where this middleware
     * is ever mounted without a preceding body-parser.
     *
     * When a body IS present it must be a JSON object: returns 400 with an
     * error message otherwise, and replaces req.body with the validated object
     * so downstream handlers get clean data.
     */
    private _validateBodyMiddleware(request: express.Request, response: express.Response, next: express.NextFunction) {
        if (request.body === undefined || request.body === null) {
            // No body sent — nothing to validate. Let the route decide whether
            // one is required.
            next();
            return;
        }

        const validated = validatePostBody(request.body);
        if (validated === null) {
            response.status(400).contentType(Json).send({ error: "request body must be a JSON object" });
            return;
        }

        // Replace req.body with the validated object so downstream handlers get the clean data
        request.body = validated;
        next();
    }

    /**
     * Ensures every request has a unique X-Request-ID.
     * If the client sent one, reuse it; otherwise generate a UUID.
     * Stores the ID in AsyncLocalStorage so any code path can access it.
     */
    private _requestIdMiddleware(
        request: AppRequest,
        response: express.Response,
        next: express.NextFunction,
    ) {
        const id = request.headers["x-request-id"] as string | undefined;
        const requestId = id ?? randomUUID();

        // Attach to request and response for downstream access
        request.id = requestId;
        response.setHeader("X-Request-ID", requestId);

        // Scope the entire request lifecycle (including async handlers)
        // to this request's async context.  Long-running operations from
        // previous requests won't inherit this ID, and this request won't
        // pick up a stale ID from a previous request.
        _reqIdStore.run(requestId, next);
    }

    // 
    private _loggerMiddleware(_request: express.Request, _response: express.Response, next: express.NextFunction) {
        // log it — request ID is picked up automatically from AsyncLocalStorage
        logger()?.write_debug("middleware.ts/loggerMiddleware", "request received");

        // continue
        next();
    }
}
