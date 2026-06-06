/*
 * Copyright (c) 2025-2026 dodson Software ( dodson labs )
 * Author: Randy Dodson <dodsonsoftware@gmail.com>
 * Licensed under the MIT License with Patent Grant and NOTICE preservation.
 * See the LICENSE file for the full terms.
 */

import type express from "express";
import { RoutesCreatorBase } from "../dodsonlabs/CreatorBase";
import * as sensor_controller from "../controllers/sensorController";
import type { MqttNetworking } from "../dodsonlabs/MqttNetworking";



export const __routesHelp: Record<string, unknown> = {
    "description": "Apis that gather information about and control over the sensors in the sensor net.",
    "commands": [
        {
            "route": "/sensors/identify",
            "description": "Retrieves identification information about all of the sensors."
        },
        {
            "route": "/sensors/identify/{source}",
            "description": "Retrieves identification information about the named sensor."
        },
        {
            "route": "/sensors/get-details",
            "description": "Retrieves detailed information about all of the sensors."
        },
        {
            "route": "/sensors/get-details/{source}",
            "description": "Retrieves detailed information about the named sensor."
        },
        {
            "route": "/sensors/reboot",
            "description": "Instructs all sensors to reboot."
        },
        {
            "route": "/sensors/reboot/{source}",
            "description": "Instructs the sensor identified by source to reboot."
        },
        {
            "route": "/sensors/read-config",
            "description": "Instructs all sensors to return their configurations."
        },
        {
            "route": "/sensors/read-config/{source}",
            "description": "Instructs the sensor identified by source to return their configuration."
        },
        {
            "route": "/sensors/write-config/{source}",
            "description": "Posts the given configuration to the sensor identified by source."
        },
        {
            "route": "/sensors/update-config/{source}",
            "description": "Posts the configuration update to the sensor identified by source."
        }
    ]
};

export class CreateSensorRoutes extends RoutesCreatorBase {

    // **** ctor

    constructor(protected app: express.Application, protected network: MqttNetworking, private ip_pinger_web_api: string) {
        super(app);
        this.network = network;
        this.ip_pinger_web_api = ip_pinger_web_api;
    }

    // **** protected functions

    protected createRoutes() {
        // IDENTIFY
        /**
         * @swagger
         * /sensors/identify:
         *   get:
         *     summary: Retrieves identification information about all of the sensors
         *     description: Returns identification information for all of the sensors.
         *     responses:
         *       200:
         *         description: Identification information for all of the sensors
         *         content:
         *           application/json:
         *             schema:
         *               type: object
         *               properties:
         *                 about:
         *                   type: string
         */
        this.app.route("/sensors/identify").get((req: express.Request, res: express.Response) => sensor_controller.getIdentify(req, res, this.network));

        // IDENTIFY
        /**
         * @swagger
         * /sensors/identify/{source}:
         *   get:
         *     summary: Retrieves identification information about the sensors by source
         *     description: Returns identification information for the specified sensor source.
         *     parameters:
         *       - name: source
         *         in: path
         *         required: true
         *         description: The name of the sensor source for identification.
         *         schema:
         *           type: string
         *     responses:
         *       200:
         *         description: Identification information for the specified sensor
         *         content:
         *           application/json:
         *             schema:
         *               type: object
         *               properties:
         *                 about:
         *                   type: string
         */
        this.app.route("/sensors/identify/:source").get((req: express.Request, res: express.Response) => sensor_controller.getIdentifyBySource(req, res, this.network, req.params.source));


        // GET-DETAILS
        /**
         * @swagger
         * /sensors/get-details:
         *   get:
         *     summary: Retrieves all information about all of the sensors
         *     description: Returns all information for all of the sensors.
         *     responses:
         *       200:
         *         description: all information for all of the sensors
         *         content:
         *           application/json:
         *             schema:
         *               type: object
         *               properties:
         *                 about:
         *                   type: string
         */
        this.app.route("/sensors/get-details").get((req: express.Request, res: express.Response) => sensor_controller.getDetails(req, res, this.network));

        // GET-DETAILS
        /**
         * @swagger
         * /sensors/get-details/{source}:
         *   get:
         *     summary: Retrieves all information about the sensors by source
         *     description: Returns all information for the specified sensor source.
         *     parameters:
         *       - name: source
         *         in: path
         *         required: true
         *         description: .
         *         schema:
         *           type: string
         *     responses:
         *       200:
         *         description: Identification information for the specified sensor
         *         content:
         *           application/json:
         *             schema:
         *               type: object
         *               properties:
         *                 about:
         *                   type: string
         */
        this.app.route("/sensors/get-details/:source").get((req: express.Request, res: express.Response) => sensor_controller.getDetailsBySource(req, res, this.network, req.params.source));

        // REBOOT
        /**
         * @swagger
         * /sensors/reboot:
         *   get:
         *     summary: Instructs all sensors to reboot
         *     description: Instructs all sensors to reboot.
         *     responses:
         *       200:
         *         description: 
         *         content:
         *           application/json:
         *             schema:
         *               type: object
         *               properties:
         *                 about:
         *                   type: string
         */
        this.app.route("/sensors/reboot").get((req: express.Request, res: express.Response) => sensor_controller.postReboot(req, res, this.network));

        // REBOOT
        /**
         * @swagger
         * /sensors/reboot/{source}:
         *   get:
         *     summary: Instructs the sensors identified by source to reboot
         *     description: Instructs the sensors identified by source to reboot.
         *     parameters:
         *       - name: source
         *         in: path
         *         required: true
         *         description: The name of the sensor.
         *         schema:
         *           type: string
         *     responses:
         *       200:
         *         description: 
         *         content:
         *           application/json:
         *             schema:
         *               type: object
         *               properties:
         *                 about:
         *                   type: string
         */
        this.app.route("/sensors/reboot/:source").get((req: express.Request, res: express.Response) => sensor_controller.PostRebootBySource(req, res, this.network, req.params.source));


        // READ-CONFIG
        /**
         * @swagger
         * /sensors/read-config:
         *   get:
         *     summary: Instructs all sensors to return their configuration
         *     description: Instructs all sensors to return their configuration.
         *     responses:
         *       200:
         *         description: 
         *         content:
         *           application/json:
         *             schema:
         *               type: object
         *               properties:
         *                 about:
         *                   type: string
         */
        this.app.route("/sensors/read-config").get((req: express.Request, res: express.Response) => sensor_controller.getReadConfig(req, res, this.network));


        // READ-CONFIG
        /**
         * @swagger
         * /sensors/read-config/{source}:
         *   get:
         *     summary: Instructs the sensors identified by source to return their configuration
         *     description: Instructs the sensors identified by source to return their configuration.
         *     parameters:
         *       - name: source
         *         in: path
         *         required: true
         *         description: The name of the sensor.
         *         schema:
         *           type: string
         *     responses:
         *       200:
         *         description: 
         *         content:
         *           application/json:
         *             schema:
         *               type: object
         *               properties:
         *                 about:
         *                   type: string
         */
        this.app.route("/sensors/read-config/:source").get((req: express.Request, res: express.Response) => sensor_controller.getReadConfigBySource(req, res, this.network, req.params.source));


        // WRITE-CONFIG
        /**
         * @swagger
         * /sensors/write-config/{source}:
         *   post:
         *     summary: Instructs the sensor identified by source to write the given configuration to their configuration file
         *     description: Posts the given configuration to the sensor identified by source.
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
         *               type: object
         *               properties:
         *                 about:
         *                   type: string
         */
        this.app.route("/sensors/write-config/:source").post((req: express.Request, res: express.Response) => sensor_controller.postWriteConfigBySource(req, res, this.network, req.params.source));


        // UPDATE-CONFIG
        /**
         * @swagger
         * /sensors/update-config/{source}:
         *   post:
         *     summary: Instructs the sensor identified by source to update the given configuration to their configuration file
         *     description: Posts the configuration update to the sensor identified by source.
         *     parameters:
         *       - name: source
         *         in: path
         *         required: true
         *         description: The name of the sensor.
         *         schema:
         *           type: string
         *     requestBody:
         *       required: true
         *       description: The configuration update to apply.
         *       content:
         *         application/json:
         *           schema:
         *             type: object
         *     responses:
         *       200:
         *         description: Configuration update result
         *         content:
         *           application/json:
         *             schema:
         *               type: object
         *               properties:
         *                 about:
         *                   type: string
         */
        this.app.route("/sensors/update-config/:source").post((req: express.Request, res: express.Response) => sensor_controller.postUpdateConfigBySource(req, res, this.network, req.params.source));
    }
}
