/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import type express from "express";
import { RoutesCreatorBase } from "../dodsonlabs/CreatorBase";
import type { MqttNetworking } from "../dodsonlabs/MqttNetworking";
import * as pinger_controller from "../controllers/pingerController";

export { pinger_controller };



// Canonical list of route paths — kept in sync with createRoutes() to prevent drift.
export const __routes: string[] = [
    "/ippinger/analyze-ippinger",
];

export const __routesHelp: Record<string, unknown> = {
    "description": "Analyzes the configured devices in the registered IP Pinger against the live-sensors and returns a report.",
    "commands": [
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
    private _fetch_timeout_ms: number;

    // **** ctor

    constructor(protected app: express.Application, protected network: MqttNetworking, ip_pinger_web_api: string, case_sensitive: boolean, fetch_timeout_ms: number) {
        super(app);
        this.network = network;
        this._ip_pinger_web_api = ip_pinger_web_api;
        this._case_sensitive = case_sensitive;
        this._fetch_timeout_ms = fetch_timeout_ms;
    }

    // **** protected functions

    protected createRoutes() {
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
         *                 properties:
         *                   source:
         *                     type: string
         *                   state:
         *                     type: string
         *                     enum: [OK, IP Address Mismatch, Name Mismatch, Offline, New]
         *                   state-value:
         *                     type: object
         *                     additionalProperties:
         *                       type: string
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
        this.app.route("/ippinger/analyze-ippinger").get((req: express.Request, res: express.Response) => pinger_controller.getAnalyzeIpPinger(req, res, this.network, this._ip_pinger_web_api, this._case_sensitive, this._fetch_timeout_ms));
    }
}
