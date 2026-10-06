/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import type express from "express";
import { RoutesCreatorBase } from "../dodsonlabs/CreatorBase";
import * as config_controller from "../controllers/configController";


// Canonical list of route paths — kept in sync with createRoutes() to prevent drift.
export const __routes: string[] = [
    "/api/reload-config",
    "/api/read-config",
    "/api/write-config",
];

export const __routesHelp: Record<string, unknown> = {
    "description": "Application configuration management (reload, read, write). Only log-level applies immediately; other settings persist and take effect after a restart (see restart_keys in the response).",
    "commands": [
        {
            "route": "/api/reload-config",
            "description": "GET Reloads the application's YAML configuration from disk. Only log-level applies immediately; other changed keys are reported as restart_required with the list in restart_keys."
        },
        {
            "route": "/api/read-config",
            "description": "GET Returns the current running application configuration as JSON, including all values (db-password, loki-url)."
        },
        {
            "route": "/api/write-config",
            "description": "POST Saves a new configuration to disk and reloads it. Only log-level applies immediately; other changed keys are reported as restart_required with the list in restart_keys. Body must contain the complete valid configuration, including db-password and loki-url."
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
         * /api/reload-config:
         *   get:
         *     summary: Reload configuration from disk
         *     description: >-
         *       Reads the configuration file from disk, validates it, and updates the running
         *       configuration reference. Only log-level takes effect immediately — the logger
         *       is re-created. Every other key is captured at construction time by long-lived
         *       components (MQTT client, middleware, routes, settings store) and takes effect
         *       after a process restart; changed keys of that kind are reported in restart_keys
         *       with restart_required set to true.
         *     responses:
         *       200:
         *         description: Configuration reloaded (check restart_required)
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
         *                   example: "Configuration reloaded; restart required for: mqtt-broker-ip-address"
         *                 restart_required:
         *                   type: boolean
         *                   example: true
         *                 restart_keys:
         *                   type: array
         *                   items:
         *                     type: string
         *                   example: [mqtt-broker-ip-address]
         *                 applied_keys:
         *                   type: array
         *                   items:
         *                     type: string
         *                   example: [log-level]
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
        this.app.route("/api/reload-config").get((req: express.Request, res: express.Response) => config_controller.reloadConfig(req, res));

        // READ CONFIG
        /**
         * @swagger
         * /api/read-config:
         *   get:
         *     summary: Read current configuration
         *     description: >-
         *       Returns the current running application configuration as a JSON
         *       object. All values are returned as-is, including db-password and
         *       loki-url — modify fields in the response and POST it back to
         *       /api/write-config to save changes without losing any values.
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
         *                 mqtt-topic-command:
         *                   type: string
         *                 mqtt-topic-command-response:
         *                   type: string
         *                 ip-pinger-web-api:
         *                   type: string
         *                 case-sensitive:
         *                   type: boolean
         *                 db-host:
         *                   type: string
         *                 db-port:
         *                   type: integer
         *                 db-name:
         *                   type: string
         *                 db-user:
         *                   type: string
         *                 db-password:
         *                   type: string
         *                 loki-url:
         *                   type: string
         *                 loki-enabled:
         *                   type: boolean
         */
        this.app.route("/api/read-config").get((req: express.Request, res: express.Response) => config_controller.readConfig(req, res));

        // WRITE CONFIG
        /**
         * @swagger
         * /api/write-config:
         *   post:
         *     summary: Save new configuration and reload
         *     description: >-
         *       Writes the provided configuration to disk and reloads it. Only log-level
         *       takes effect immediately; every other changed key takes effect after a
         *       process restart and is reported in restart_keys with restart_required set
         *       to true. The entire configuration must be provided (not partial updates),
         *       including the database fields and credentials (db-password, loki-url).
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
         *               - mqtt-topic-command
         *               - mqtt-topic-command-response
         *               - ip-pinger-web-api
         *               - case-sensitive
         *               - db-host
         *               - db-port
         *               - db-name
         *               - db-user
         *               - db-password
         *             properties:
         *               express-port:
         *                 type: integer
         *               log-level:
         *                 type: string
         *                 enum: [error, warn, info, debug]
         *               mqtt-broker-ip-address:
         *                 type: string
         *               mqtt-topic-command:
         *                 type: string
         *               mqtt-topic-command-response:
         *                 type: string
         *               ip-pinger-web-api:
         *                 type: string
         *               case-sensitive:
         *                 type: boolean
         *               db-host:
         *                 type: string
         *               db-port:
         *                 type: integer
         *               db-name:
         *                 type: string
         *               db-user:
         *                 type: string
         *               db-password:
         *                 type: string
         *               sensor-telemetry-api:
         *                 type: string
         *               swagger-server-url:
         *                 type: string
         *               loki-url:
         *                 type: string
         *               loki-enabled:
         *                 type: boolean
         *               mqtt-topic-log:
         *                 type: string
         *               forward-sensor-logs:
         *                 type: boolean
         *               forward-sensor-logs-level:
         *                 type: string
         *                 enum: [error, warn, info, debug]
         *               express-body-limit:
         *                 type: string
         *               cors-allowed-origins:
         *                 type: array
         *                 items:
         *                   type: string
         *               rate-limit-window-ms:
         *                 type: integer
         *               rate-limit-max:
         *                 type: integer
         *               sensor-source-max-length:
         *                 type: integer
         *               sensor-source-valid-chars-regex:
         *                 type: string
         *               ippinger-fetch-timeout-ms:
         *                 type: integer
         *               fetch-timeout-ms:
         *                 type: integer
         *                 description: Deprecated alias for ippinger-fetch-timeout-ms
         *               command-silence-timeout-ms:
         *                 type: integer
         *     responses:
         *       200:
         *         description: Configuration saved and reloaded (check restart_required)
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
         *                   example: "Configuration saved; restart required for: express-port"
         *                 restart_required:
         *                   type: boolean
         *                   example: true
         *                 restart_keys:
         *                   type: array
         *                   items:
         *                     type: string
         *                   example: [express-port]
         *                 applied_keys:
         *                   type: array
         *                   items:
         *                     type: string
         *                   example: [log-level]
         *       400:
         *         description: Invalid configuration or request body
         *       500:
         *         description: Failed to save configuration
         */
        this.app.route("/api/write-config").post((req: express.Request, res: express.Response) => config_controller.writeConfig(req, res));
    }
}
