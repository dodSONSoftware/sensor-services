/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
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
    "/date-local",
    "/date-utc",
    "/endpoints",
    "/health",
    "/metrics",
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
            "route": "/date-local",
            "description": "Returns the current local date and time of the server's timezone. Format=[yyyy-mm-ddThh:mm:ss]"
        },
        {
            "route": "/date-utc",
            "description": "Returns the current date and time in Coordinated Universal Time (UTC). Format=[yyyy-mm-ddThh:mm:ssZ]"
        },
        {
            "route": "/health",
            "description": "Returns the health status of the API including MQTT broker, IP Pinger, and Sensor Telemetry connectivity."
        },
        {
            "route": "/endpoints",
            "description": "Returns detailed information about each API endpoint."
        },
        {
            "route": "/metrics",
            "description": "Prometheus scrape endpoint for API-specific metrics (HTTP requests, duration, errors)."
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
        this.app.route("/about").get(async (req: express.Request, res: express.Response) => {
            const typedReq = req as express.Request & {
                mqtt_connected: boolean;
            };
            typedReq.mqtt_connected = this.networking.is_connected();
            await general_controller.getAbout(req, res);
        });

        // ENDPOINTS
        /**
         * @swagger
         * /endpoints:
         *   get:
         *     summary: List all API endpoints
         *     description: Returns detailed information about each API endpoint including name, route, verb, request/response body, and description.
         *     responses:
         *       200:
         *         description: Array of endpoint details
         *         content:
         *           application/json:
         *             schema:
         *               type: object
         *               properties:
         *                 endpoints:
         *                   type: array
         *                   items:
         *                     type: object
         *                     properties:
         *                       name:
         *                         type: string
         *                       route:
         *                         type: string
         *                       verb:
         *                         type: string
         *                       requestBody:
         *                         type: string
         *                       responseBody:
         *                         type: string
         *                       description:
         *                         type: string
         */
        this.app.route("/endpoints").get(general_controller.getEndpoints);

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

        // LOCAL DATETIME (dash variant)
        /**
         * @swagger
         * /date-local:
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
        this.app.route("/date-local").get((req: express.Request, res: express.Response) => general_controller.getDateCurrent(req, res));

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

        // UTC DATETIME (dash variant)
        /**
         * @swagger
         * /date-utc:
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
        this.app.route("/date-utc").get((req: express.Request, res: express.Response) => general_controller.getDateUTC(req, res));

        // HEALTH
        /**
         * @swagger
         * /health:
         *   get:
         *     summary: Retrieve the health status of the API
         *     description: Returns the current health status including MQTT broker, IP Pinger, and Sensor Telemetry connectivity.
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
         *                   enum: [healthy, degraded]
         *                 mqtt:
         *                   type: string
         *                   enum: [connected, disconnected]
         *                 ipPinger:
         *                   type: string
         *                   enum: [healthy, unreachable]
         *                 sensorTelemetry:
         *                   type: string
         *                   enum: [healthy, unreachable]
         *                 timestamp:
         *                   type: string
         *                   format: date-time
         */
        this.app.route("/health").get(async (req: express.Request, res: express.Response) => {
            const typedReq = req as express.Request & {
                mqtt_connected: boolean;
            };
            typedReq.mqtt_connected = this.networking.is_connected();
            await general_controller.getHealth(req, res);
        });

        // API METRICS
        /**
         * @swagger
         * /metrics:
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
        this.app.route("/metrics").get(async (_req: express.Request, res: express.Response) => {
            res.set("Content-Type", apiMetricsRegistry.contentType);
            res.end(await apiMetricsRegistry.metrics());
        });
    }
}
