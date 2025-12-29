/*
 * Copyright (c) 2025 dodson Software ( dodson labs )
 * Author: Randy Dodson <dodsonsoftware@gmail.com>
 * Licensed under the MIT License with Patent Grant and NOTICE preservation.
 * See the LICENSE file for the full terms.
 */

import express from "express";
import { RoutesCreatorBase } from "../dodsonlabs/CreatorBase";
import * as sensor_controller from "../controllers/sensorController";
import { MqttNetworking } from "../dodsonlabs/MqttNetworking";

export class CreateSensorRoutes extends RoutesCreatorBase {
    // **** ctor

    constructor(protected app: express.Application, protected network: MqttNetworking) {
        super(app);
        this.network = network;
    }

    // **** protected functions

    protected createRoutes() {
        // IDENTIFY
        /**
         * @swagger
         * /identify:
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
        this.app.route("/identify").get((req: express.Request, res: express.Response) => sensor_controller.getIdentify(req, res, this.network));
        // IDENTIFY
        /**
         * @swagger
         * /identify/{source}:
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
         */ this.app.route("/identify/:source").get((req: express.Request, res: express.Response) => sensor_controller.getIdentifyBySource(req, res, this.network, req.params.source));


        // GET-DETAILS
        /**
         * @swagger
         * /get-details:
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
        this.app.route("/get-details").get((req: express.Request, res: express.Response) => sensor_controller.getDetails(req, res, this.network));
        // GET-DETAILS
        /**
         * @swagger
         * /get-details/{source}:
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
         */ this.app.route("/get-details/:source").get((req: express.Request, res: express.Response) => sensor_controller.getDetailsBySource(req, res, this.network, req.params.source));


        // REBOOT
        /**
         * @swagger
         * /reboot:
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
        this.app.route("/reboot").get((req: express.Request, res: express.Response) => sensor_controller.postReboot(req, res, this.network));
        // REBOOT
        /**
         * @swagger
         * /reboot/{source}:
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
         */ this.app.route("/reboot/:source").get((req: express.Request, res: express.Response) => sensor_controller.PostRebootBySource(req, res, this.network, req.params.source));


        // READ-CONFIG
        /**
         * @swagger
         * /read-config:
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
        this.app.route("/read-config").get((req: express.Request, res: express.Response) => sensor_controller.getReadConfig(req, res, this.network));
        // READ-CONFIG
        /**
         * @swagger
         * /read-config/{source}:
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
         */ this.app.route("/read-config/:source").get((req: express.Request, res: express.Response) => sensor_controller.getReadConfigBySource(req, res, this.network, req.params.source));


        // WRITE-CONFIG
        /**
         * @swagger
         * /write-config/{source}:
         *   get:
         *     summary: Instructs the sensors identified by source to write thsi given configuration to their configuration file
         *     description: Instructs the sensors identified by source to write thsi given configuration to their configuration file.
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
         */ this.app.route("/write-config/:source").get((req: express.Request, res: express.Response) => sensor_controller.postWriteConfigBySource(req, res, this.network, req.params.source));


        // UPDATE-CONFIG
        /**
         * @swagger
         * /update-config/{source}:
         *   get:
         *     summary: Instructs the sensors identified by source to update this given configuration to their configuration file
         *     description: Instructs the sensors identified by source to update this given configuration to their configuration file.
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
         */ this.app.route("/update-config/:source").get((req: express.Request, res: express.Response) => sensor_controller.postUpdateConfigBySource(req, res, this.network, req.params.source));
    }
}
