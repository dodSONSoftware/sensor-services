/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import type express from "express";
import { RoutesCreatorBase } from "../dodsonlabs/CreatorBase";
import * as settings_controller from "../controllers/settingsController";


// Canonical list of route paths — kept in sync with createRoutes() to prevent drift.
export const __routes: string[] = [
    "/settings",
    "/settings/defaults",
    "/settings/update",
];

export const __routesHelp: Record<string, unknown> = {
    "description": "Application settings for the Angular dashboard (UI preferences + MQTT connection details).",
    "commands": [
        {
            "route": "/settings",
            "description": "GET all application settings with defaults applied."
        },
        {
            "route": "/settings/defaults",
            "description": "GET current settings plus schema metadata (labels, types, enums, ranges) for dynamic form generation."
        },
        {
            "route": "/settings/update",
            "description": "PATCH partial update of application settings. Returns full merged result."
        }
    ]
};

export class CreateSettingsRoutes extends RoutesCreatorBase {
    // **** ctor

    constructor(app: express.Application) {
        super(app);
    }

    // **** protected functions

    protected createRoutes() {
        // GET SETTINGS
        /**
         * @swagger
         * /settings:
         *   get:
         *     summary: Retrieve all application settings
         *     description: Returns the full set of application settings including UI preferences (theme, layout) and server connection details (MQTT broker address). Missing keys are filled with defaults.
         *     responses:
         *       200:
         *         description: Application settings
         *         content:
         *           application/json:
         *             schema:
         *               type: object
         *               properties:
         *                 theme:
         *                   type: boolean
         *                   default: true
         *                 dashboard_layout:
         *                   type: string
         *                   enum: [grid, list]
         *                 notification_level:
         *                   type: string
         *                   enum: [none, warn, critical]
         *                 time_range_hours:
         *                   type: integer
         *                 decimal_places:
         *                   type: integer
         *                 mqtt_broker_address:
         *                   type: string
         *                 mqtt_topic_telemetry:
         *                   type: string
         *                 mqtt_topic_command:
         *                   type: string
         *                 mqtt_topic_command_response:
         *                   type: string
         */
        this.app.route("/settings").get((req: express.Request, res: express.Response) => settings_controller.getAllSettings(req, res));

        // GET DEFAULTS + SCHEMA METADATA
        /**
         * @swagger
         * /settings/defaults:
         *   get:
         *     summary: Retrieve current settings plus schema metadata for discovery
         *     description: Returns the full set of application settings merged with defaults, along with per-field schema metadata (labels, types, valid enums/ranges). The Angular frontend uses this to build forms dynamically without hardcoding field definitions.
         *     responses:
         *       200:
         *         description: Settings and schema metadata
         *         content:
         *           application/json:
         *             schema:
         *               type: object
         *               properties:
         *                 settings:
         *                   type: object
         *                   description: Current merged settings values
         *                 schema:
         *                   type: object
         *                   description: Per-field metadata for dynamic form generation
         */
        this.app.route("/settings/defaults").get((req: express.Request, res: express.Response) => settings_controller.getSettingsDefaults(req, res));

        // UPDATE SETTINGS (PATCH)
        /**
         * @swagger
         * /settings/update:
         *   patch:
         *     summary: Partially update application settings
         *     description: Send only the fields you want to change. Missing keys retain their current values. Returns the full merged result.
         *     requestBody:
         *       required: true
         *       content:
         *         application/json:
         *           schema:
         *             type: object
         *             properties:
         *               theme:
         *                 type: boolean
         *                 default: true
         *               dashboard_layout:
         *                 type: string
         *                 enum: [grid, list]
         *               notification_level:
         *                 type: string
         *                 enum: [none, warn, critical]
         *               time_range_hours:
         *                 type: integer
         *               decimal_places:
         *                 type: integer
         *     responses:
         *       200:
         *         description: Updated application settings (full merged result)
         *         content:
         *           application/json:
         *             schema:
         *               type: object
         *       500:
         *         description: Database persistence failure
         *         content:
         *           application/json:
         *             schema:
         *               type: object
         *               properties:
         *                 error:
         *                   type: string
         */
        this.app.route("/settings/update").patch((req: express.Request, res: express.Response) => settings_controller.updateSettings(req, res));
    }
}
