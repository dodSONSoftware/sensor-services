/*
 * Author: Randy Dodson ( dodson labs )
 * License: 2025, MIT License (see LICENSE file for details)
 */

import * as express from "express";
import { RoutesCreatorBase } from "../dodsonlabs/CreatorBase";
import { logger } from "../common/global";


// **** public classes

export class CreateMiddleware extends RoutesCreatorBase {

    // **** ctor

    constructor(protected app: express.Application) {
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
