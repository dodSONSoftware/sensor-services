/*
 * Copyright (c) 2025-2026 dodson Software ( dodson labs )
 * Author: Randy Dodson <dodsonsoftware@gmail.com>
 * Licensed under the MIT License with Patent Grant and NOTICE preservation.
 * See the LICENSE file for the full terms.
 */

import type express from "express";
import { RoutesCreatorBase } from "../dodsonlabs/CreatorBase";
import type { MqttNetworking } from "../dodsonlabs/MqttNetworking";
import * as pinger_controller from "../controllers/pingerController";



export const __routesHelp: Record<string, unknown> = {
    "description": "Apis that gather information about and control over the registered IP Pinger.",
    "commands": [
        {
            "route": "/ippinger/about",
            "description": "Gets helpful information about the registered IP Pinger."
        },
        {
            "route": "/ippinger/read-config",
            "description": "Gets the current configuration from the registered IP Pinger."
        },
        {
            "route": "/ippinger/write-config",
            "description": "Posts the configuration, request.body, to the registered IP Pinger."
        },
        {
            "route": "/ippinger/restart",
            "description": "Instructs the registered IP Pinger service to restart."
        },
        {
            "route": "/ippinger/ping",
            "description": "Instructs the registered IP Pinger service to ping all of its devices and return the results."
        },
        {
            "route": "/ippinger/ping/{ip-address}",
            "description": "Instructs the registered IP Pinger service to ping the given ip-address and return the results."
        },
        {
            "route": "/ippinger/analyze-ippinger",
            "description": "Analyzes the configured devices in the registered IP Pinger against the live-sensors and returns a report."
        }
    ]
};

export class CreatePingerRoutes extends RoutesCreatorBase {

    // **** private properties

    private _ip_pinger_web_api: string;
    private _case_sensitive: boolean;

    // **** ctor

    constructor(protected app: express.Application, protected network: MqttNetworking, private ip_pinger_web_api: string, case_sensitive: boolean) {
        super(app);
        this.network = network;
        this._ip_pinger_web_api = ip_pinger_web_api;
        this._case_sensitive = case_sensitive;
    }

    // **** protected functions

    protected createRoutes() {
        // ABOUT
        /**
         * @swagger
         * /ippinger/about:
         *   get:
         *     summary: 
         *     description: .
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
        this.app.route("/ippinger/about").get((req: express.Request, res: express.Response) => pinger_controller.getAbout(req, res, this._ip_pinger_web_api));

        // READ-CONFIG
        /**
         * @swagger
         * /ippinger/read-config:
         *   get:
         *     summary: 
         *     description: .
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
        this.app.route("/ippinger/read-config").get((req: express.Request, res: express.Response) => pinger_controller.getReadConfig(req, res, this._ip_pinger_web_api));

        // WRITE-CONFIG
        /**
         * @swagger
         * /ippinger/write-config:
         *   post:
         *     summary: 
         *     description: .
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
        this.app.route("/ippinger/write-config").post((req: express.Request, res: express.Response) => {
            const data = req.body;
            pinger_controller.postWriteConfig(req, res, this._ip_pinger_web_api, data);
        });

        // RESTART
        /**
         * @swagger
         * /ippinger/restart:
         *   post:
         *     summary: 
         *     description: .
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
        this.app.route("/ippinger/restart").post((req: express.Request, res: express.Response) => pinger_controller.postRestart(req, res, this._ip_pinger_web_api));

        // PING
        /**
         * @swagger
         * /ippinger/ping:
         *   post:
         *     summary: 
         *     description: .
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
        this.app.route("/ippinger/ping").get((req: express.Request, res: express.Response) => pinger_controller.getPings(req, res, this._ip_pinger_web_api));


        // PING/{TARGET}
        /**
         * @swagger
         * /ippinger/ping/{target}:
         *   post:
         *     summary: 
         *     description: .
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
        this.app.route("/ippinger/ping/:target").get((req: express.Request, res: express.Response) => pinger_controller.getPing(req, res, this._ip_pinger_web_api, req.params.target));

        // ANALYZE-IPPINGER
        /**
         * @swagger
         * /sensors/analyze-ippinger:
         *   get:
         *     summary: Will analyze the live sensors with the registered IP Pinger's configuration.
         *     description: Will analyze the live sensors with the registered IP Pinger's configuration.
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
        this.app.route("/ippinger/analyze-ippinger").get((req: express.Request, res: express.Response) => pinger_controller.getAnalyzeIpPinger(req, res, this.network, this._ip_pinger_web_api, this._case_sensitive));
    }
}
