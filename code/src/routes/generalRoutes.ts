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



// Canonical list of route paths — kept in sync with createRoutes() to prevent drift.
export const __routes: string[] = [
    "/about",
    "/date_local",
    "/date_utc",
    "/health",
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
        }
    ]
};

export class CreateGeneralRoutes extends RoutesCreatorBase {
    private readonly mqtt_connected: boolean;
    private readonly prometheus_server_ready: boolean;

    // **** ctor

    constructor(app: express.Application, networking: MqttNetworking) {
        super(app);
        this.mqtt_connected = networking.is_connected();
        this.prometheus_server_ready = networking.prometheus_server_ready();
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
         *                 commands:
         *                   type: array
         *                   items:
         *                     type: object
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
            typedReq.mqtt_connected = this.mqtt_connected;
            typedReq.prometheus_server_ready = this.prometheus_server_ready;
            general_controller.getHealth(req, res);
        });
    }
}
