/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import type express from "express";
import { RoutesCreatorBase } from "../dodsonlabs/CreatorBase";
import * as settings_controller from "../controllers/settingsController";


// Canonical list of route paths — kept in sync with createRoutes() to prevent drift.
export const __routes: string[] = [
    "/ui/settings",
    "/ui/settings-schema",
    "/ui/settings-update",
];

export const __routesHelp: Record<string, unknown> = {
    "description": "Application settings for the Angular dashboard (UI preferences + MQTT connection details).",
    "commands": [
        {
            "route": "/ui/settings",
            "description": "GET all application settings with defaults applied."
        },
        {
            "route": "/ui/settings-schema",
            "description": "GET setting definitions with name, default, range, and description for dynamic form generation."
        },
        {
            "route": "/ui/settings-update",
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
         * /ui/settings:
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
         *                   type: string
         *                   enum: [light, dark]
         *                   default: light
         *                 dashboard_layout:
         *                   type: string
         *                   enum: [cards, list]
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
        this.app.route("/ui/settings").get((req: express.Request, res: express.Response) => settings_controller.getAllSettings(req, res));

        // GET SCHEMA - Setting definitions with name, default, range, and description
        /**
         * @swagger
         * /ui/settings-schema:
         *   get:
         *     summary: Retrieve setting definitions for dynamic form generation
         *     description: Returns an array of setting definitions, each containing name, default value, range (min/max or options), and description. The Angular frontend uses this to build forms dynamically without hardcoding field definitions.
         *     responses:
         *       200:
         *         description: Array of setting definitions
         *         content:
         *           application/json:
         *             schema:
         *               type: array
         *               items:
         *                 type: object
         *                 properties:
         *                   name:
         *                     type: string
         *                     description: The setting key
         *                   default:
         *                     type: any
         *                     description: Default value for the setting
         *                   range:
         *                     oneOf:
         *                       - type: object
         *                         properties:
         *                           min:
         *                             type: number
         *                           max:
         *                             type: number
         *                           step:
         *                             type: number
         *                         description: Range constraints for numeric settings
         *                       - type: object
         *                         properties:
         *                           options:
         *                             type: array
         *                             items:
         *                               type: string
         *                         description: Valid options for enum settings
         *                       - type: "null"
         *                         description: No range constraints (e.g., strings, enums)
         *                   description:
         *                     type: string
         *                     description: Human-readable description of the setting
         */
        this.app.route("/ui/settings-schema").get((req: express.Request, res: express.Response) => settings_controller.getSettingsSchema(req, res));

        // UPDATE SETTINGS (PATCH)
        /**
         * @swagger
         * /ui/settings-update:
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
         *                 type: string
         *                 enum: [light, dark]
         *                 default: light
         *               dashboard_layout:
         *                 type: string
         *                 enum: [cards, list]
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
        this.app.route("/ui/settings-update").patch((req: express.Request, res: express.Response) => settings_controller.updateSettings(req, res));
    }
}
