/*
 * Copyright (c) 2025-2026 dodson Software ( dodson labs )
 * Author: Randy Dodson <dodsonsoftware@gmail.com>
 * Licensed under the MIT License with Patent Grant and NOTICE preservation.
 * See the LICENSE file for the full terms.
 */

import type express from "express";
import { RoutesCreatorBase } from "../dodsonlabs/CreatorBase";
import * as general_controller from "../controllers/generalController";



export const __routesHelp: Record<string, any> = {
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
            "description": "Returns the health status of the API including MQTT broker connectivity."
        }
    ]
};

export class CreateGeneralRoutes extends RoutesCreatorBase {
    private readonly mqtt_connected: boolean;

    // **** ctor

    constructor(app: express.Application, mqtt_connected: boolean) {
        super(app);
        this.mqtt_connected = mqtt_connected;
    }

    // **** protected functions

    protected createRoutes() {
        // ABOUT
        /**
         * @swagger
         * /about:
         *   get:
         *     summary: Retrieve information about the API
         *     description: Returns a description of the API and its purpose.
         *     responses:
         *       200:
         *         description: A brief introduction to the API
         *         content:
         *           application/json:
         *             schema:
         *               type: object
         *               properties:
         *                 about:
         *                   type: string
         */
        this.app.route("/about").get((req: express.Request, res: express.Response) => general_controller.getAbout(req, res));

        // CURRENT DATETIME
        /**
         * @swagger
         * /date_local:
         *   get:
         *     summary: Retrieve the current local date and time
         *     description: Returns the current local date and time of the server's timezone.
         *     responses:
         *       200:
         *         description: The current local date and time
         *         content:
         *           application/json:
         *             schema:
         *               type: object
         *               properties:
         *                 localTime:
         *                   type: string
         *                   format: date-time
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
         *     description: Returns the current health status including MQTT broker connectivity and uptime.
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
         *                 uptime_seconds:
         *                   type: integer
         *                 timestamp:
         *                   type: string
         *                   format: date-time
         */
        this.app.route("/health").get((req: express.Request, res: express.Response) => {
            (req as express.Request & { mqtt_connected: boolean }).mqtt_connected = this.mqtt_connected;
            general_controller.getHealth(req, res);
        });
    }
}
