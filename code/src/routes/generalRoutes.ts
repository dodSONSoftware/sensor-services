/*
 * Author: Randy Dodson ( dodson labs )
 * License: 2025, MIT License (see LICENSE file for details)
 */

import express from 'express';
import { CreatorsBase } from '../dodsonlabs/CreatorBase';
import * as general_controller from "../controllers/generalController";
import { logger } from '../common/global';



export class CreateRoutes extends CreatorsBase {

    // **** ctor

    constructor(protected app: express.Application) {
        super(app);
        this.routeNotFound();
    }

    // **** protected functions

    protected create() {
        // ABOUT
        /**
         * @swagger
         * /about:
         *   get:
         *     summary: Retrieve information about the API
         *     description: Returns a description of the API and its purpose.
         *     responses:
         *       200:
         *         description: A brief introduction to the API
         *         content:
         *           application/json:
         *             schema:
         *               type: object
         *               properties:
         *                 about:
         *                   type: string
         */
        this.app.route('/about')
            .get((req: express.Request, res: express.Response) => general_controller.getAbout(req, res));

        // CURRENT DATETIME
        /**
         * @swagger
         * /date_local:
         *   get:
         *     summary: Retrieve the current local date and time
         *     description: Returns the current local date and time of the server's timezone.
         *     responses:
         *       200:
         *         description: The current local date and time
         *         content:
         *           application/json:
         *             schema:
         *               type: object
         *               properties:
         *                 localTime:
         *                   type: string
         *                   format: date-time
         */
        this.app.route('/date_local')
            .get((req: express.Request, res: express.Response) => general_controller.getDateCurrent(req, res));

        // UTC DATETIME
        /**
         * @swagger
         * /date_utc:
         *   get:
         *     summary: Retrieve the current UTC date and time
         *     description: Returns the current date and time in Coordinated Universal Time (UTC).
         *     responses:
         *       200:
         *         description: The current UTC date and time
         *         content:
         *           application/json:
         *             schema:
         *               type: object
         *               properties:
         *                 utcTime:
         *                   type: string
         *                   format: date-time
         */
        this.app.route('/date_utc')
            .get((req: express.Request, res: express.Response) => general_controller.getDateUTC(req, res));

        // TODO: add more routes and functionality
    }

    protected routeNotFound() {
        this.app.use((req: express.Request, res: express.Response) => {
            res.status(404).json({
                message: "The requested resource was not found."
            });

            logger.write_error("CreateRoutes.ts/routeNotFound", `${req.method} ${req.url}. Route not found.`);
        });
    }
}
