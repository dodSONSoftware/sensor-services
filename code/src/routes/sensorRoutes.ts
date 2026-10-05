/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import type express from "express";
import { RoutesCreatorBase } from "../dodsonlabs/CreatorBase";
import * as sensor_controller from "../controllers/sensorController";
import type { MqttNetworking } from "../dodsonlabs/MqttNetworking";



// Canonical list of route paths — kept in sync with createRoutes() to prevent drift.
export const __routes: string[] = [
    "/sensors/get-details",
    "/sensors/get-details/:source",
    "/sensors/reboot",
    "/sensors/reboot/:source",
    "/sensors/read-config",
    "/sensors/read-config/:source",
    "/sensors/write-config/:source",
    "/sensors/update-config/:source",
];

export const __routesHelp: Record<string, unknown> = {
    "description": "Apis that gather information about and control over the sensors in the sensor net.",
    "commands": [
        {
            "route": "/sensors/get-details",
            "description": "Retrieves detailed information about all of the sensors."
        },
        {
            "route": "/sensors/get-details/:source",
            "description": "Retrieves detailed information about the named sensor."
        },
        {
            "route": "/sensors/reboot",
            "description": "Sends a reboot command to all sensors via MQTT. The firmware resets ~5 seconds after responding."
        },
        {
            "route": "/sensors/reboot/:source",
            "description": "Sends a reboot command to the sensor identified by source via MQTT."
        },
        {
            "route": "/sensors/read-config",
            "description": "Instructs all sensors to return their configurations."
        },
        {
            "route": "/sensors/read-config/:source",
            "description": "Instructs the sensor identified by source to return their configuration."
        },
        {
            "route": "/sensors/write-config/:source",
            "description": "Posts the complete configuration to the sensor identified by source. The request body must be the sensor's complete config object."
        },
        {
            "route": "/sensors/update-config/:source",
            "description": "Deprecated — firmware v4 has no partial update. Returns 501; use write-config with a complete config."
        }
    ]
};

export class CreateSensorRoutes extends RoutesCreatorBase {

    // **** ctor

    constructor(protected app: express.Application, protected network: MqttNetworking) {
        super(app);
        this.network = network;
    }

    // **** protected functions

    protected createRoutes() {
        // GET-DETAILS
        /**
         * @swagger
         * /sensors/get-details:
         *   get:
         *     summary: Retrieves all information about all of the sensors
         *     description: Returns all information for all of the sensors.
         *     responses:
         *       200:
         *         description: All information for all of the sensors
         *         content:
         *           application/json:
         *             schema:
         *               type: array
         *               items:
         *                 type: object
         *                 properties:
         *                   source:
         *                     type: string
         *                   payload:
         *                     type: object
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
        this.app.route("/sensors/get-details").get((req: express.Request, res: express.Response) => sensor_controller.getDetails(req, res, this.network));

        // GET-DETAILS
        /**
         * @swagger
         * /sensors/get-details/{source}:
         *   get:
         *     summary: Retrieves all information about a specific sensor
         *     description: Returns detailed information for the sensor identified by source.
         *     parameters:
         *       - name: source
         *         in: path
         *         required: true
         *         description: The name of the sensor to get details for.
         *         schema:
         *           type: string
         *     responses:
         *       200:
         *         description: Detailed information for the specified sensor
         *         content:
         *           application/json:
         *             schema:
         *               type: array
         *               items:
         *                 type: object
         *                 properties:
         *                   source:
         *                     type: string
         *                   payload:
         *                     type: object
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
        this.app.route("/sensors/get-details/:source").get((req: express.Request, res: express.Response) => sensor_controller.getDetailsBySource(req, res, this.network, req.params.source));

        // REBOOT
        // POST is the canonical method (reboot is a state-changing operation).
        // GET is still accepted during the compatibility period for callers
        // that predate the POST contract.
        /**
         * @swagger
         * /sensors/reboot:
         *   post:
         *     summary: Instructs all sensors to reboot
         *     description: Sends a reboot command to all sensors via MQTT. GET is also accepted during the compatibility period.
         *     responses:
         *       200:
         *         description: Reboot command results for all sensors
         *         content:
         *           application/json:
         *             schema:
         *               type: array
         *               items:
         *                 type: object
         *                 properties:
         *                   source:
         *                     type: string
         *                   payload:
         *                     type: object
         *                   command_metadata:
         *                     type: object
         *                     properties:
         *                       command_id:
         *                         type: string
         *                       command_sent_at:
         *                         type: string
         *                       expected_delay_seconds:
         *                         type: integer
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
        const rebootAllHandler = (req: express.Request, res: express.Response) => sensor_controller.postReboot(req, res, this.network);
        this.app.route("/sensors/reboot").post(rebootAllHandler).get(rebootAllHandler);

        // REBOOT
        /**
         * @swagger
         * /sensors/reboot/{source}:
         *   post:
         *     summary: Instructs a specific sensor to reboot
         *     description: Sends a reboot command to the sensor identified by source via MQTT. GET is also accepted during the compatibility period.
         *     parameters:
         *       - name: source
         *         in: path
         *         required: true
         *         description: The name of the sensor to reboot.
         *         schema:
         *           type: string
         *     responses:
         *       200:
         *         description: Reboot command result for the specified sensor
         *         content:
         *           application/json:
         *             schema:
         *               type: array
         *               items:
         *                 type: object
         *                 properties:
         *                   source:
         *                     type: string
         *                   payload:
         *                     type: object
         *                   command_metadata:
         *                     type: object
         *                     properties:
         *                       command_id:
         *                         type: string
         *                       command_sent_at:
         *                         type: string
         *                       expected_delay_seconds:
         *                         type: integer
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
        const rebootSourceHandler = (req: express.Request, res: express.Response) => sensor_controller.postRebootBySource(req, res, this.network, req.params.source);
        this.app.route("/sensors/reboot/:source").post(rebootSourceHandler).get(rebootSourceHandler);


        // READ-CONFIG
        /**
         * @swagger
         * /sensors/read-config:
         *   get:
         *     summary: Instructs all sensors to return their configuration
         *     description: Sends a read-config command to all sensors via MQTT and returns their current configurations.
         *     responses:
         *       200:
         *         description: Configuration data from all sensors
         *         content:
         *           application/json:
         *             schema:
         *               type: array
         *               items:
         *                 type: object
         *                 properties:
         *                   source:
         *                     type: string
         *                   payload:
         *                     type: object
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
        this.app.route("/sensors/read-config").get((req: express.Request, res: express.Response) => sensor_controller.getReadConfig(req, res, this.network));


        // READ-CONFIG
        /**
         * @swagger
         * /sensors/read-config/{source}:
         *   get:
         *     summary: Instructs a specific sensor to return its configuration
         *     description: Sends a read-config command to the sensor identified by source via MQTT and returns its current configuration.
         *     parameters:
         *       - name: source
         *         in: path
         *         required: true
         *         description: The name of the sensor to read configuration from.
         *         schema:
         *           type: string
         *     responses:
         *       200:
         *         description: Configuration data from the specified sensor
         *         content:
         *           application/json:
         *             schema:
         *               type: array
         *               items:
         *                 type: object
         *                 properties:
         *                   source:
         *                     type: string
         *                   payload:
         *                     type: object
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
        this.app.route("/sensors/read-config/:source").get((req: express.Request, res: express.Response) => sensor_controller.getReadConfigBySource(req, res, this.network, req.params.source));


        // WRITE-CONFIG
        /**
         * @swagger
         * /sensors/write-config/{source}:
         *   post:
         *     summary: Instructs the sensor identified by source to write the given configuration to their configuration file
         *     description: Posts the given configuration to the sensor identified by source. The request body must be the sensor's complete config object (firmware v4 rejects partial configs).
         *     parameters:
         *       - name: source
         *         in: path
         *         required: true
         *         description: The name of the sensor.
         *         schema:
         *           type: string
         *     requestBody:
         *       required: true
         *       description: The configuration to write.
         *       content:
         *         application/json:
         *           schema:
         *             type: object
         *     responses:
         *       200:
         *         description: Configuration write result
         *         content:
         *           application/json:
         *             schema:
         *               type: array
         *               items:
         *                 type: object
         *                 properties:
         *                   source:
         *                     type: string
         *                   payload:
         *                     type: object
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
        this.app.route("/sensors/write-config/:source").post((req: express.Request, res: express.Response) => {
            sensor_controller.postWriteConfigBySource(req, res, this.network, req.params.source);
        });


        // UPDATE-CONFIG (deprecated)
        /**
         * @swagger
         * /sensors/update-config/{source}:
         *   post:
         *     summary: Deprecated — partial config updates are not supported by firmware v4
         *     description: Deprecated and unsupported. Firmware v4 has no partial configuration update, so this endpoint always returns 501 Not Implemented. Use POST /sensors/write-config/{source} with the sensor's complete config instead.
         *     deprecated: true
         *     parameters:
         *       - name: source
         *         in: path
         *         required: true
         *         description: The name of the sensor.
         *         schema:
         *           type: string
         *     requestBody:
         *       required: true
         *       description: The configuration update to apply. Ignored — the endpoint is deprecated and returns 501 without processing the body.
         *       content:
         *         application/json:
         *           schema:
         *             type: object
         *     responses:
         *       501:
         *         description: Not Implemented — firmware v4 has no partial configuration update
         *         content:
         *           application/json:
         *             schema:
         *               type: object
         *               properties:
         *                 error:
         *                   type: string
         */
        this.app.route("/sensors/update-config/:source").post((req: express.Request, res: express.Response) => {
            sensor_controller.postUpdateConfigBySource(req, res, this.network, req.params.source);
        });
    }
}
