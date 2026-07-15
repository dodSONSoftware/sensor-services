/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import type express from "express";
import { RoutesCreatorBase } from "../dodsonlabs/CreatorBase";
import type { MqttNetworking } from "../dodsonlabs/MqttNetworking";
import * as pinger_controller from "../controllers/pingerController";

export { pinger_controller };



// Route registration is handled separately in index.ts
export const __routes: string[] = [];

export const __routesHelp: Record<string, unknown> = {
    "description": "",
    "commands": []
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
