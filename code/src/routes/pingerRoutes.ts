/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import type express from "express";
import { RoutesCreatorBase } from "../dodsonlabs/CreatorBase";
import type { MqttNetworking } from "../dodsonlabs/MqttNetworking";
import * as pinger_controller from "../controllers/pingerController";

export { pinger_controller };



// Canonical list of route paths — kept in sync with createRoutes() to prevent
// drift. /sensors/ippinger-analyze is registered in THIS module (createRoutes
// below), so its metadata lives here, not in sensorRoutes (P3-4).
export const __routes: string[] = [
    "/sensors/ippinger-analyze",
];

export const __routesHelp: Record<string, unknown> = {
    "description": "Analysis endpoints that compare the configured IP Pinger devices against the live sensors.",
    "commands": [
        {
            "route": "/sensors/ippinger-analyze",
            "description": "Analyzes the configured devices in the registered IP Pinger against the live sensors and returns a report."
        }
    ]
};

export class CreatePingerRoutes extends RoutesCreatorBase {
    constructor(
        protected app: express.Application,
        protected network: MqttNetworking,
        private ip_pinger_web_api: string,
        private case_sensitive: boolean,
        private fetch_timeout_ms: number
    ) {
        super(app);
    }

    protected createRoutes() {
        // Register analyze endpoint under /sensors namespace
        this.app.route("/sensors/ippinger-analyze").get((req: express.Request, res: express.Response) =>
            pinger_controller.getAnalyzeIpPinger(
                req, res, this.network, this.ip_pinger_web_api, this.case_sensitive, this.fetch_timeout_ms
            )
        );
    }
}
