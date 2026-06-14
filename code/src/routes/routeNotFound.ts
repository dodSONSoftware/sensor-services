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
            res.status(NotFound).json({
                message: "The requested resource was not found.",
            });

            logger()?.write_error("CreateRouteNotFound.ts/routeNotFound", `${req.method} ${req.url}. Route not found.`);
        });
    }
}
