/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import type express from "express";
import { RoutesCreatorBase } from "../dodsonlabs/CreatorBase";
import * as log_controller from "../controllers/logController";

// Canonical list of route paths — kept in sync with createRoutes() to prevent drift.
export const __routes: string[] = [
    "/sensors/logs/:source",
];

export const __routesHelp: Record<string, unknown> = {
    "description": "APIs for retrieving logs from Grafana Loki for sensors.",
    "commands": [
        {
            "route": "/sensors/logs/:source",
            "description": "Retrieves logs for the named sensor from Loki."
        }
    ]
};

export class CreateLogRoutes extends RoutesCreatorBase {

    // **** ctor

    constructor(protected app: express.Application) {
        super(app);
    }

    // **** protected functions

    protected createRoutes() {
        // LOGS
        /**
         * @swagger
         * /sensors/logs/{source}:
         *   get:
         *     summary: Retrieves logs for a specific sensor from Loki
         *     description: Returns log entries for the specified sensor source filtered by level.
         *     parameters:
         *       - name: source
         *         in: path
         *         required: true
         *         description: The name of the sensor source.
         *         schema:
         *           type: string
         *       - name: level
         *         in: query
         *         required: false
         *         description: Log level(s) to filter (debug, info, warn, error). Can be specified multiple times.
         *         schema:
         *           type: array
         *           items:
         *             type: string
         *       - name: limit
         *         in: query
         *         required: false
         *         description: Maximum number of log entries to return (default 50, max 100).
         *         schema:
         *           type: integer
         *     responses:
         *       200:
         *         description: Log entries for the sensor
         *         content:
         *           application/json:
         *             schema:
         *               type: array
         *               items:
         *                 type: object
         *                 properties:
         *                   timestamp:
         *                     type: string
         *                   level:
         *                     type: string
         *                   message:
         *                     type: string
         *       500:
         *         description: Internal error
         *         content:
         *           application/json:
         *             schema:
         *               type: object
         *               properties:
         *                 error:
         *                   type: string
         */
        this.app.route("/sensors/logs/:source").get((req: express.Request, res: express.Response) => log_controller.getLogs(req, res));
    }
}
