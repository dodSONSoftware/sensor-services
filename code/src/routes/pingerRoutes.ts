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
import { validatePostBody } from "../schemas/postBody";
import { Json } from "../dodsonlabs/HttpConstants";



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
         *     summary: Get IP Pinger service information
         *     description: Proxies to the IP Pinger service /about endpoint to retrieve service metadata.
         *     responses:
         *       200:
         *         description: IP Pinger service information
         *         content:
         *           application/json:
         *             schema:
         *               type: object
         */
        this.app.route("/ippinger/about").get((req: express.Request, res: express.Response) => pinger_controller.getAbout(req, res, this._ip_pinger_web_api));

        // READ-CONFIG
        /**
         * @swagger
         * /ippinger/read-config:
         *   get:
         *     summary: Get IP Pinger configuration
         *     description: Proxies to the IP Pinger service /read-config endpoint to retrieve its current configuration.
         *     responses:
         *       200:
         *         description: IP Pinger configuration data
         *         content:
         *           application/json:
         *             schema:
         *               type: object
         */
        this.app.route("/ippinger/read-config").get((req: express.Request, res: express.Response) => pinger_controller.getReadConfig(req, res, this._ip_pinger_web_api));

        // WRITE-CONFIG
        /**
         * @swagger
         * /ippinger/write-config:
         *   post:
         *     summary: Write IP Pinger configuration
         *     description: Proxies a POST to the IP Pinger service /write-config endpoint to update its configuration.
         *     requestBody:
         *       required: true
         *       description: The configuration object to write.
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
         */
        this.app.route("/ippinger/write-config").post((req: express.Request, res: express.Response) => {
            const validated = validatePostBody(req.body);
            if (validated === null) {
                res.status(400).contentType(Json).send({ error: "request body must be a JSON object" });
                return;
            }
            req.body = validated;
            pinger_controller.postWriteConfig(req, res, this._ip_pinger_web_api, validated);
        });

        // RESTART
        /**
         * @swagger
         * /ippinger/restart:
         *   post:
         *     summary: Restart IP Pinger service
         *     description: Proxies a POST to the IP Pinger service /restart endpoint to trigger a service restart.
         *     requestBody:
         *       required: true
         *       description: Configuration data sent with the restart request.
         *       content:
         *         application/json:
         *           schema:
         *             type: object
         *     responses:
         *       200:
         *         description: Restart result
         *         content:
         *           application/json:
         *             schema:
         *               type: object
         */
        this.app.route("/ippinger/restart").post((req: express.Request, res: express.Response) => {
            const validated = validatePostBody(req.body);
            if (validated === null) {
                res.status(400).contentType(Json).send({ error: "request body must be a JSON object" });
                return;
            }
            req.body = validated;
            pinger_controller.postRestart(req, res, this._ip_pinger_web_api);
        });

        // PING
        /**
         * @swagger
         * /ippinger/ping:
         *   get:
         *     summary: Ping all IP Pinger devices
         *     description: Proxies to the IP Pinger service /ping endpoint to ping all configured devices and return results.
         *     responses:
         *       200:
         *         description: Ping results for all configured devices
         *         content:
         *           application/json:
         *             schema:
         *               type: array
         *               items:
         *                 type: object
         */
        this.app.route("/ippinger/ping").get((req: express.Request, res: express.Response) => pinger_controller.getPings(req, res, this._ip_pinger_web_api));


        // PING/{TARGET}
        /**
         * @swagger
         * /ippinger/ping/{target}:
         *   get:
         *     summary: Ping a specific IP address
         *     description: Proxies to the IP Pinger service /ping/{target} endpoint to ping a specific IP address.
         *     parameters:
         *       - name: target
         *         in: path
         *         required: true
         *         description: The IP address to ping.
         *         schema:
         *           type: string
         *     responses:
         *       200:
         *         description: Ping result for the specified IP address
         *         content:
         *           application/json:
         *             schema:
         *               type: array
         *               items:
         *                 type: object
         */
        this.app.route("/ippinger/ping/:target").get((req: express.Request, res: express.Response) => pinger_controller.getPing(req, res, this._ip_pinger_web_api, req.params.target));

        // ANALYZE-IPPINGER
        /**
         * @swagger
         * /ippinger/analyze-ippinger:
         *   get:
         *     summary: Analyze IP Pinger configuration against live sensors
         *     description: Compares the configured devices in the IP Pinger against live sensor telemetry and returns a report with states: OK, IP Address Mismatch, Name Mismatch, Offline, New.
         *     responses:
         *       200:
         *         description: Analysis report comparing IP Pinger config to live sensors
         *         content:
         *           application/json:
         *             schema:
         *               type: array
         *               items:
         *                 type: object
         */
        this.app.route("/ippinger/analyze-ippinger").get((req: express.Request, res: express.Response) => pinger_controller.getAnalyzeIpPinger(req, res, this.network, this._ip_pinger_web_api, this._case_sensitive));
    }
}
