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

// **** public classes

export class CreateMiddleware extends RoutesCreatorBase {
    // **** ctor

    constructor(protected app: express.Application, config: z.infer<typeof configSchema>) {
        _config = config;

        // add CORS
        app.use(cors());

        // add JSON (configurable body limit, default 1mb)
        const bodyLimit = config["express-body-limit"] ?? "1mb";
        app.use(express.json({ limit: bodyLimit }));

        // ----
        super(app);
    }

    // **** protected functions

    protected createRoutes() {
        // add rate limiting (configurable, default 100 requests per 15 minutes)
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

        // add request ID middleware (must run before logger so every log has a traceable ID)
        this.app.use(this._requestIdMiddleware.bind(this));

        // add middleware components
        this.app.use(this._loggerMiddleware.bind(this));
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
