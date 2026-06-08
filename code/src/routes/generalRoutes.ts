/*
 * Copyright (c) 2025-2026 dodson Software ( dodson labs )
 * Author: Randy Dodson <dodsonsoftware@gmail.com>
 * Licensed under the MIT License with Patent Grant and NOTICE preservation.
 * See the LICENSE file for the full terms.
 */

import type express from "express";
import { RoutesCreatorBase } from "../dodsonlabs/CreatorBase";
import * as general_controller from "../controllers/generalController";
import type { MqttNetworking } from "../dodsonlabs/MqttNetworking";
import { apiMetricsRegistry } from "../common/metrics";



// Canonical list of route paths — kept in sync with createRoutes() to prevent drift.
export const __routes: string[] = [
    "/about",
    "/date_local",
    "/date_utc",
    "/health",
    "/metrics/api",
    "/ready",
];

export const __routesHelp: Record<string, unknown> = {
    "description": "Some basic apis.",
    "commands": [
        {
            "route": "/about",
            "description": "Returns this description."
        },
        {
            "route": "/date_local",
            "description": "Returns the current local date and time of the server's timezone. Format=[yyyy-mm-ddThh:mm:ss]"
        },
        {
            "route": "/date_utc",
            "description": "Returns the current date and time in Coordinated Universal Time (UTC). Format=[yyyy-mm-ddThh:mm:ssZ]"
        },
        {
            "route": "/health",
            "description": "Returns the health status of the API including MQTT broker, Prometheus server, memory, and CPU."
        },
        {
            "route": "/metrics/api",
            "description": "Prometheus scrape endpoint for API-specific metrics (HTTP requests, duration, errors). Separate from sensor metrics on port 3301."
        },
        {
            "route": "/ready",
            "description": "Readiness probe — returns 200 when all subsystems (MQTT, Prometheus) are connected, 503 otherwise."
        }
    ]
};

export class CreateGeneralRoutes extends RoutesCreatorBase {
    private readonly networking: MqttNetworking;

    // **** ctor

    constructor(app: express.Application, networking: MqttNetworking) {
        super(app);
        this.networking = networking;
    }

    // **** protected functions

    protected createRoutes() {
        // ABOUT
        /**
         * @swagger
         * /about:
         *   get:
         *     summary: Retrieve information about the API
         *     description: Returns API metadata including name, version, author, and a list of available commands.
         *     responses:
         *       200:
         *         description: API metadata and command list
         *         content:
         *           application/json:
         *             schema:
         *               type: object
         *               properties:
         *                 about:
         *                   type: object
         *                   properties:
         *                     name:
         *                       type: string
         *                     version:
         *                       type: string
         *                     author:
         *                       type: string
         *                     description:
         *                       type: string
         *                     copyright:
         *                       type: string
         *                     license:
         *                       type: string
         *                 system_info:
         *                   type: array
         *                   items:
         *                     type: object
         *                     properties:
         *                       key:
         *                         type: string
         *                       value:
         *                         type: string
         *                 commands:
         *                   type: array
         *                   items:
         *                     type: object
         *                     properties:
         *                       name:
         *                         type: string
         *                       help:
         *                         type: object
         */
        this.app.route("/about").get((req: express.Request, res: express.Response) => general_controller.getAbout(req, res));

        // CURRENT DATETIME
        /**
         * @swagger
         * /date_local:
         *   get:
         *     summary: Retrieve the current local date and time
         *     description: Returns the current local date and time of the server's timezone as a plain text string in yyyy-mm-ddThh:mm:ss format.
         *     responses:
         *       200:
         *         description: The current local date and time
         *         content:
         *           text/plain:
         *             schema:
         *               type: string
         *               example: "2026-06-06T14:30:00"
         */
        this.app.route("/date_local").get((req: express.Request, res: express.Response) => general_controller.getDateCurrent(req, res));

        // UTC DATETIME
        /**
         * @swagger
         * /date_utc:
         *   get:
         *     summary: Retrieve the current UTC date and time
         *     description: Returns the current date and time in Coordinated Universal Time (UTC).
         *     responses:
         *       200:
         *         description: The current UTC date and time
         *         content:
         *           application/json:
         *             schema:
         *               type: object
         *               properties:
         *                 utcTime:
         *                   type: string
         *                   format: date-time
         *                   example: "2026-06-07T14:30:00Z"
         */
        this.app.route("/date_utc").get((req: express.Request, res: express.Response) => general_controller.getDateUTC(req, res));

        // HEALTH
        /**
         * @swagger
         * /health:
         *   get:
         *     summary: Retrieve the health status of the API
         *     description: Returns the current health status including MQTT broker, Prometheus server, memory, and CPU.
         *     responses:
         *       200:
         *         description: API health status
         *         content:
         *           application/json:
         *             schema:
         *               type: object
         *               properties:
         *                 status:
         *                   type: string
         *                   enum: [ok, degraded]
         *                 service:
         *                   type: string
         *                 version:
         *                   type: string
         *                 mqtt:
         *                   type: string
         *                   enum: [connected, disconnected]
         *                 prometheus_server:
         *                   type: string
         *                   enum: [ready, not_ready]
         *                 uptime_seconds:
         *                   type: integer
         *                 timestamp:
         *                   type: string
         *                   format: date-time
         *                 memory:
         *                   type: object
         *                   properties:
         *                     rss:
         *                       type: integer
         *                     heap_used:
         *                       type: integer
         *                     heap_total:
         *                       type: integer
         *                 cpu:
         *                   type: object
         *                   properties:
         *                     load:
         *                       type: number
         */
        this.app.route("/health").get((req: express.Request, res: express.Response) => {
            const typedReq = req as express.Request & {
                mqtt_connected: boolean;
                prometheus_server_ready: boolean;
            };
            typedReq.mqtt_connected = this.networking.is_connected();
            typedReq.prometheus_server_ready = this.networking.prometheus_server_ready();
            general_controller.getHealth(req, res);
        });

        // API METRICS
        /**
         * @swagger
         * /metrics/api:
         *   get:
         *     summary: Prometheus scrape endpoint for API metrics
         *     description: Returns Prometheus-formatted metrics for HTTP requests, request duration, and 5xx errors. This endpoint serves API-specific metrics separately from the sensor metrics exposed by PrometheusWriter on port 3301.
         *     responses:
         *       200:
         *         description: Prometheus-formatted API metrics text
         *         content:
         *           text/plain; version=0.0.4; charset=utf-8:
         *             schema:
         *               type: string
         */
        this.app.route("/metrics/api").get(async (_req: express.Request, res: express.Response) => {
            res.set("Content-Type", apiMetricsRegistry.contentType);
            res.end(await apiMetricsRegistry.metrics());
        });

        // READINESS PROBE
        /**
         * @swagger
         * /ready:
         *   get:
         *     summary: Readiness probe for Kubernetes or orchestration tools
         *     description: Returns 200 when all subsystems (MQTT broker, Prometheus server) are connected and ready to serve. Returns 503 when still starting up or a dependency is unavailable.
         *     responses:
         *       200:
         *         description: All subsystems are ready
         *         content:
         *           application/json:
         *             schema:
         *               type: object
         *               properties:
         *                 status:
         *                   type: string
         *                   enum: [ready, not_ready]
         *                 dependencies:
         *                   type: object
         *                   properties:
         *                     mqtt:
         *                       type: string
         *                       enum: [connected, disconnected]
         *                     prometheus_server:
         *                       type: string
         *                       enum: [ready, not_ready]
         *       503:
         *         description: One or more subsystems are not ready
         *         content:
         *           application/json:
         *             schema:
         *               type: object
         *               properties:
         *                 status:
         *                   type: string
         *                   enum: [ready, not_ready]
         *                 dependencies:
         *                   type: object
         *                   properties:
         *                     mqtt:
         *                       type: string
         *                       enum: [connected, disconnected]
         *                     prometheus_server:
         *                       type: string
         *                       enum: [ready, not_ready]
         */
        this.app.route("/ready").get((req: express.Request, res: express.Response) => {
            const typedReq = req as express.Request & {
                mqtt_connected: boolean;
                prometheus_server_ready: boolean;
            };
            typedReq.mqtt_connected = this.networking.is_connected();
            typedReq.prometheus_server_ready = this.networking.prometheus_server_ready();
            general_controller.getReady(req, res);
        });
    }
}
