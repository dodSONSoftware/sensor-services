/*
 * Copyright (c) 2025-2026 dodson Software ( dodson labs )
 * Author: Randy Dodson <dodsonsoftware@gmail.com>
 * Licensed under the MIT License with Patent Grant and NOTICE preservation.
 * See the LICENSE file for the full terms.
 */

import * as express from "express";
import { RoutesCreatorBase } from "../dodsonlabs/CreatorBase";
import { logger } from "../common/global";

// **** public classes

export class CreateMiddleware extends RoutesCreatorBase {
    // **** ctor

    constructor(protected app: express.Application) {
        // add CORS
        const cors = require("cors");
        app.use(cors());

        // add JSON
        app.use(express.json());

        // ----
        super(app);
    }

    // **** protected functions

    protected createRoutes() {
        // add middleware components
        this.app.use(this.loggerMiddleware);

        // TODO: add more middleware
    }

    // **** private functions

    private loggerMiddleware(request: express.Request, response: express.Response, next: any) {
        // log it
        logger.write_debug("middleware.ts/loggerMiddleware", `${request.method} "${request.path}"`);

        // continue
        next();
    }
}
