/*
 * Copyright (c) 2025 dodson Software ( dodson labs )
 * Author: Randy Dodson <dodsonsoftware@gmail.com>
 * Licensed under the MIT License with Patent Grant and NOTICE preservation.
 * See the LICENSE file for the full terms.
 */

import express from "express";
import { RoutesCreatorBase } from "../dodsonlabs/CreatorBase";
import * as sensor_controller from "../controllers/sensorController";
import { Networking } from "../dodsonlabs/Networking";

export class CreateSensorRoutes extends RoutesCreatorBase {
    // **** ctor

    constructor(protected app: express.Application, protected network: Networking) {
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
    }
}
