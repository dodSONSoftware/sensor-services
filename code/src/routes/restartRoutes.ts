/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import type express from "express";
import { RoutesCreatorBase } from "../dodsonlabs/CreatorBase";
import { RESTART_FALLBACK_DELAY_MS, RestartService } from "../controllers/restartController";

// Canonical list of route paths — kept in sync with createRoutes() to prevent drift.
export const __routes: string[] = [
    "/restart-service",
];

export const __routesHelp: Record<string, unknown> = {
    "description": "Service lifecycle: schedule a graceful self-restart. Optional and fail-closed — usable only when a valid RESTART_SERVICE_TOKEN environment variable is set (32+ alphanumeric characters); otherwise every request answers 503 and the service runs normally.",
    "commands": [
        {
            "route": "/restart-service",
            "description": "POST Schedules a graceful self-restart (self-SIGTERM; the container restart policy starts the service again with its persisted configuration). Requires Authorization: Bearer <RESTART_SERVICE_TOKEN>. Returns 202 (restart_scheduled) when accepted — the restart happens after the response is delivered. The request body is ignored. 405 for non-POST, 401 for a missing/invalid Authorization header, 409 when a restart is already pending, 503 when the endpoint is disabled."
        }
    ]
};

export class CreateRestartRoutes extends RoutesCreatorBase {
    // **** ctor
    //
    // rawToken is the UNVALIDATED RESTART_SERVICE_TOKEN environment variable
    // value; validation happens inside RestartService (fail-closed: a bad
    // token only ever disables the endpoint, never refuses startup). The
    // token is an environment variable only — deliberately never a config.yml
    // key, because /api/read-config returns the configuration unredacted.
    //
    // requestRestart is the lifecycle hook (index.ts self-signals SIGTERM —
    // the same graceful path `docker stop` takes). The HTTP layer only
    // requests a restart; it never owns process lifecycle.
    private readonly service: RestartService;

    constructor(
        app: express.Application,
        rawToken: string | undefined,
        requestRestart?: () => void,
        // Injectable fallback window (tests); production keeps the default.
        fallbackDelayMs: number = RESTART_FALLBACK_DELAY_MS
    ) {
        super(app);
        this.service = new RestartService(rawToken, requestRestart, fallbackDelayMs);
    }

    // **** protected functions

    protected createRoutes() {
        // RESTART SERVICE
        /**
         * @swagger
         * /restart-service:
         *   post:
         *     summary: Schedule a graceful self-restart
         *     description: >-
         *       Asks the service to gracefully restart itself. Optional and
         *       fail-closed: usable only when a valid RESTART_SERVICE_TOKEN
         *       environment variable is set (32+ alphanumeric characters);
         *       otherwise every request answers 503 and the service runs
         *       normally. On acceptance the service answers 202 first, then
         *       runs the same graceful SIGTERM shutdown `docker stop`
         *       triggers; the container's restart policy starts it again with
         *       its persisted configuration. The request body is ignored.
         *       Every response carries Cache-Control: no-store; the 202 also
         *       carries Connection: close.
         *     parameters:
         *       - name: Authorization
         *         in: header
         *         required: true
         *         description: Bearer scheme carrying the RESTART_SERVICE_TOKEN
         *         schema:
         *           type: string
         *           example: "Bearer 32+ alphanumeric characters"
         *     responses:
         *       202:
         *         description: Restart scheduled (happens after the response is delivered)
         *         content:
         *           application/json:
         *             schema:
         *               type: object
         *               properties:
         *                 success:
         *                   type: boolean
         *                   example: true
         *                 status:
         *                   type: string
         *                   example: restart_scheduled
         *                 message:
         *                   type: string
         *                   example: "Service restart requested"
         *       401:
         *         description: "Missing or invalid Authorization header (with WWW-Authenticate: Bearer)"
         *         content:
         *           application/json:
         *             schema:
         *               type: object
         *               properties:
         *                 success:
         *                   type: boolean
         *                   example: false
         *                 message:
         *                   type: string
         *                   example: "missing or invalid Authorization header"
         *       405:
         *         description: "Method not allowed (Allow: POST)"
         *       409:
         *         description: A restart is already in progress
         *         content:
         *           application/json:
         *             schema:
         *               type: object
         *               properties:
         *                 success:
         *                   type: boolean
         *                   example: false
         *                 message:
         *                   type: string
         *                   example: "Restart already in progress."
         *       503:
         *         description: Endpoint disabled (token unset, empty, or invalid — byte-identical in all three states)
         *         content:
         *           application/json:
         *             schema:
         *               type: object
         *               properties:
         *                 success:
         *                   type: boolean
         *                   example: false
         *                 message:
         *                   type: string
         *                   example: "Restart endpoint is disabled."
         */
        // Registered with .all() so every verb reaches the handler and can
        // answer 405 with Allow: POST — this app has no global 405 (an
        // unhandled verb would fall through to the 404 catch-all). OPTIONS
        // preflights are answered earlier by the cors middleware.
        this.app.route("/restart-service").all((req: express.Request, res: express.Response) => {
            this.service.handle(req, res);
        });
    }
}
