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

// **** public classes

export class CreateMiddleware extends RoutesCreatorBase {
    // **** ctor
    //
    // Routes/middleware are installed when register() is called (after this
    // constructor finishes), so all dependencies are plain instance fields —
    // no module-level shims needed.

    constructor(
        protected app: express.Application,
        private config: z.infer<typeof configSchema>,
        // Optional API-metrics middleware (createApiMetricsMiddleware in
        // common/metrics.ts). Passed in by index.ts so it can be installed
        // AHEAD of the rate limiter — the order is what makes 429 responses
        // observable (P3-2). Tests that don't care about metrics omit it.
        private metricsMiddleware?: express.RequestHandler
    ) {
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
        if (this.metricsMiddleware) {
            this.app.use(this.metricsMiddleware);
        }

        // 3. add CORS — restricted to the configured allowed origins (P3-5).
        //    A request whose Origin is in the list gets Access-Control-Allow-Origin
        //    reflecting it; a disallowed Origin gets NO CORS header, so the browser
        //    blocks the cross-origin response; a non-browser request (no Origin
        //    header — curl, the pinger service, server-to-server calls) is
        //    unaffected and still works. When `cors-allowed-origins` is unset the
        //    allowlist is empty, so no cross-origin browser request is authorized
        //    (secure default): set the web UI origin(s) in config to enable it.
        //    Only `origin` is constrained; the default allowed methods/headers are
        //    left unchanged so existing clients keep working.
        const allowedOrigins = this.config["cors-allowed-origins"] ?? [];
        this.app.use(cors({ origin: allowedOrigins }));

        // 4. add rate limiting (configurable, default 100 requests per 15
        //    minutes). Runs BEFORE the JSON body parser (below) so an over-limit
        //    client's (potentially oversized) body is rejected without being
        //    parsed.
        const windowMs = this.config["rate-limit-window-ms"] ?? 900_000;
        const max = this.config["rate-limit-max"] ?? 100;
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
            //
            // The match must cover every routing of each path, not just the bare
            // form: Express's default (non-strict) routing also serves /health/
            // and /metrics/, and the rate limiter sees req.path verbatim (trailing
            // slash intact), so an exact `=== "/health"` match left those routings
            // ratable. The `/?` anchor matches the path with an optional single
            // trailing slash and nothing else (not /healthx, /healthcheck, or
            // /health/…), keeping the exemption from leaking to other routes.
            skip: (req: express.Request) => /^\/(health|metrics)\/?$/.test(req.path),
        }));

        // 5. add JSON (configurable body limit, default 1mb) — after rate
        //    limiting, so a 429'd request's body is never parsed.
        //
        //    /restart-service is never parsed: its contract is that the
        //    request stream is NEVER consumed (the body is irrelevant), so a
        //    malformed or truncated body must not 400 in the parser before
        //    the token gate, and a mid-body client disconnect must not emit
        //    on an unread stream. The parser is invoked CONDITIONALLY below
        //    rather than via a `skip` option — the pinned body-parser (1.20;
        //    no 1.x or 2.x release) has no skip option, and it ignores
        //    unknown options silently, so a `skip:` callback would never
        //    fire and a malformed body would 400 in every token state.
        //
        //    The exclusion must cover every routing of the path, not just
        //    the bare form: Express's default (non-strict) routing also
        //    serves /restart-service/, and this wrapper sees req.path
        //    verbatim (trailing slash intact). The `/?` anchor matches the
        //    path with an optional single trailing slash and nothing else
        //    (not /restart-servicex or /restart-service/…), so the
        //    exclusion cannot leak to other routes — the same anchoring as
        //    the rate-limit exemption above.
        //
        //    The middleware ordering above is unchanged, and every other
        //    request runs the exact same parser as before.
        const bodyLimit = this.config["express-body-limit"] ?? "1mb";
        const jsonParser = express.json({ limit: bodyLimit });
        this.app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
            if (/^\/restart-service\/?$/.test(req.path)) {
                next();
                return;
            }
            jsonParser(req, res, next);
        });

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
     * Reuses a client-supplied ID only when it is a single, non-empty string
     * of bounded length (<= 128 chars); otherwise (absent, multi-valued, or
     * oversized) generates a fresh UUID.
     * Stores the ID in AsyncLocalStorage so any code path can access it.
     *
     * Node/Express types this header as string | string[] | undefined — a
     * client can send the header twice, which arrives as an array. The ID is
     * echoed verbatim in the response header and interpolated into every log
     * line's tag, so it must stay a single bounded string: the invariant
     * every downstream consumer is typed against.
     */
    private _requestIdMiddleware(
        request: AppRequest,
        response: express.Response,
        next: express.NextFunction,
    ) {
        const supplied = request.headers["x-request-id"];
        const requestId =
            typeof supplied === "string" && supplied.length > 0 && supplied.length <= 128
                ? supplied
                : randomUUID();

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
