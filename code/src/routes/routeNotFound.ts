/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import type express from "express";
import { RoutesCreatorBase } from "../dodsonlabs/CreatorBase";
import { logger } from "../common/global";
import { NotFound } from "../dodsonlabs/HttpConstants";

export class CreateRouteNotFound extends RoutesCreatorBase {
    // **** ctor

    constructor(protected app: express.Application) {
        super(app);
        this.routeNotFound();
    }

    // **** protected functions

    protected createRoutes() { }

    // **** private functions

    protected routeNotFound() {
        this.app.use((req: express.Request, res: express.Response) => {
            if (!res.headersSent) {  // only fire for truly unmatched requests (matched routes send headers first)
                res.status(NotFound).json({
                    message: "The requested resource was not found.",
                });

                // A 404 is client behavior (typo, scanning, stale link), not a
                // server failure — log it at warn so it stays visible without
                // polluting error-level alerts (P3-3).
                logger()?.write_warn("CreateRouteNotFound.ts/routeNotFound", `${req.method} ${req.url}. Route not found.`);
            }
        });
    }
}
