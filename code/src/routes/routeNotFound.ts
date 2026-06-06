/*
 * Copyright (c) 2025-2026 dodson Software ( dodson labs )
 * Author: Randy Dodson <dodsonsoftware@gmail.com>
 * Licensed under the MIT License with Patent Grant and NOTICE preservation.
 * See the LICENSE file for the full terms.
 */

import type express from "express";
import { RoutesCreatorBase } from "../dodsonlabs/CreatorBase";
import { logger } from "../common/global";



export const __routesHelp: Record<string, unknown> = {
    "description": "When all else fails...",
    "commands": []
};

export class CreateRouteNotFound extends RoutesCreatorBase {
    // **** ctor

    constructor(protected app: express.Application) {
        super(app);
        this.routeNotFound();
    }

    // **** protected functions

    protected createRoutes() { }

    // **** protected functions

    protected routeNotFound() {
        this.app.use((req: express.Request, res: express.Response) => {
            res.status(404).json({
                message: "The requested resource was not found.",
            });

            logger?.write_error("CreateRouteNotFound.ts/routeNotFound", `${req.method} ${req.url}. Route not found.`);
        });
    }
}
