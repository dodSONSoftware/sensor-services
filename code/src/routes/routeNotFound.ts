/*
 * Author: Randy Dodson ( dodson labs )
 * License: 2025, MIT License (see LICENSE file for details)
 */

import express from 'express';
import { RoutesCreatorBase } from '../dodsonlabs/CreatorBase';
import { logger } from '../common/global';



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
                message: "The requested resource was not found."
            });

            logger.write_error("CreatorsBase.ts/routeNotFound", `${req.method} ${req.url}. Route not found.`);
        });
    }
}
