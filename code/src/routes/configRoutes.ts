/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import type express from "express";
import { RoutesCreatorBase } from "../dodsonlabs/CreatorBase";
import * as config_controller from "../controllers/configController";


// Canonical list of route paths — kept in sync with createRoutes() to prevent drift.
export const __routes: string[] = [
    "/reload-config",
    "/read-config",
    "/write-config",
];

export const __routesHelp: Record<string, unknown> = {
    "description": "Application configuration management (hot-reload, read, write).",
    "commands": [
        {
            "route": "/reload-config",
            "description": "GET Reloads the application's YAML configuration from disk and updates the running configuration."
        },
        {
            "route": "/read-config",
            "description": "GET Reads the current configuration from disk, reloads it, and returns the updated configuration as JSON."
        },
        {
            "route": "/write-config",
            "description": "POST Saves a new configuration to disk and reloads the application. Body must contain the complete valid configuration."
        }
    ]
};

export class CreateConfigRoutes extends RoutesCreatorBase {
    // **** ctor

    constructor(app: express.Application) {
        super(app);
    }

    // **** protected functions

    protected createRoutes() {
        // RELOAD CONFIG
        /**
         * @swagger
         * /reload-config:
         *   get:
         *     summary: Hot-reload configuration from disk
         *     description: Reads the configuration file from disk, validates it, and updates the running configuration. The MQTT client and logger are re-initialized with the new settings.
         *     responses:
         *       200:
         *         description: Configuration reloaded successfully
         *         content:
         *           application/json:
         *             schema:
         *               type: object
         *               properties:
         *                 success:
         *                   type: boolean
         *                   example: true
         *                 message:
         *                   type: string
         *                   example: Configuration reloaded successfully
         *       500:
         *         description: Failed to reload configuration
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
         *                   example: Could not find config file
         */
        this.app.route("/reload-config").get((req: express.Request, res: express.Response) => config_controller.reloadConfig(req, res));

        // READ CONFIG
        /**
         * @swagger
         * /read-config:
         *   get:
         *     summary: Read current configuration
         *     description: Returns the current application configuration as a JSON object.
         *     responses:
         *       200:
         *         description: Current configuration
         *         content:
         *           application/json:
         *             schema:
         *               type: object
         *               properties:
         *                 express-port:
         *                   type: integer
         *                 log-level:
         *                   type: string
         *                   enum: [error, warn, info, debug]
         *                 mqtt-broker-ip-address:
         *                   type: string
         *                 mqtt-topic-telemetry:
         *                   type: string
         *                 mqtt-topic-command:
         *                   type: string
         *                 mqtt-topic-command-response:
         *                   type: string
         *                 ip-pinger-web-api:
         *                   type: string
         *                 case-sensitive:
         *                   type: boolean
         */
        this.app.route("/read-config").get((req: express.Request, res: express.Response) => config_controller.readConfig(req, res));

        // WRITE CONFIG
        /**
         * @swagger
         * /write-config:
         *   post:
         *     summary: Save new configuration and reload
         *     description: Writes the provided configuration to disk and hot-reloads the application. The entire configuration must be provided (not partial updates).
         *     requestBody:
         *       required: true
         *       content:
         *         application/json:
         *           schema:
         *             type: object
         *             required:
         *               - express-port
         *               - log-level
         *               - mqtt-broker-ip-address
         *               - mqtt-topic-telemetry
         *               - mqtt-topic-command
         *               - mqtt-topic-command-response
         *               - ip-pinger-web-api
         *               - case-sensitive
         *             properties:
         *               express-port:
         *                 type: integer
         *               log-level:
         *                 type: string
         *                 enum: [error, warn, info, debug]
         *               mqtt-broker-ip-address:
         *                 type: string
         *               mqtt-topic-telemetry:
         *                 type: string
         *               mqtt-topic-command:
         *                 type: string
         *               mqtt-topic-command-response:
         *                 type: string
         *               ip-pinger-web-api:
         *                 type: string
         *               case-sensitive:
         *                 type: boolean
         *     responses:
         *       200:
         *         description: Configuration saved and reloaded successfully
         *         content:
         *           application/json:
         *             schema:
         *               type: object
         *               properties:
         *                 success:
         *                   type: boolean
         *                   example: true
         *                 message:
         *                   type: string
         *                   example: Configuration updated successfully
         *       400:
         *         description: Invalid configuration or request body
         *       500:
         *         description: Failed to save configuration
         */
        this.app.route("/write-config").post((req: express.Request, res: express.Response) => config_controller.writeConfig(req, res));
    }
}
