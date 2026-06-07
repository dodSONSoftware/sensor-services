/*
 * Copyright (c) 2025-2026 dodson Software ( dodson labs )
 * Author: Randy Dodson <dodsonsoftware@gmail.com>
 * Licensed under the MIT License with Patent Grant and NOTICE preservation.
 * See the LICENSE file for the full terms.
 */

import cors from "cors";
import * as express from "express";
import { RoutesCreatorBase } from "../dodsonlabs/CreatorBase";
import { logger } from "../common/global";
import { validatePostBody } from "../schemas/postBody";
import { Json } from "../dodsonlabs/HttpConstants";

// **** public classes

export class CreateMiddleware extends RoutesCreatorBase {
    // **** ctor

    constructor(protected app: express.Application) {
        // add CORS
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

    private loggerMiddleware(request: express.Request, response: express.Response, next: express.NextFunction) {
        // log it
        logger()?.write_debug("middleware.ts/loggerMiddleware", `${request.method} "${request.path}"`);

        // continue
        next();
    }

    /**
     * Validates that the request body is a plain object using Zod.
     * Returns 400 with an error message if validation fails, otherwise calls next().
     */
    private validateBodyMiddleware(request: express.Request, response: express.Response, next: express.NextFunction) {
        if (request.body === undefined || request.body === null) {
            response.status(400).contentType(Json).send({ error: "request body is required" });
            return;
        }

        const validated = validatePostBody(request.body);
        if (validated === null) {
            response.status(400).contentType(Json).send({ error: "request body must be a JSON object" });
            return;
        }

        // Replace req.body with the validated object so downstream handlers get the clean data
        request.body = validated;
        next();
    }
}
