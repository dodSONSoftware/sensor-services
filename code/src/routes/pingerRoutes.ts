/*
 * Copyright (c) 2025 dodson Software ( dodson labs )
 * Author: Randy Dodson <dodsonsoftware@gmail.com>
 * Licensed under the MIT License with Patent Grant and NOTICE preservation.
 * See the LICENSE file for the full terms.
 */

import express from "express";
import { RoutesCreatorBase } from "../dodsonlabs/CreatorBase";
import * as pinger_controller from "../controllers/pingerController";
import { ParamsDictionary } from "express-serve-static-core";
import { ParsedQs } from "qs";


export class CreatePingerRoutes extends RoutesCreatorBase {

    // **** private properties

    private _ip_pinger_ipaddress: string;

    // **** ctor

    constructor(protected app: express.Application, ip_pinger_web_api: string) {
        super(app);
        this._ip_pinger_ipaddress = ip_pinger_web_api;
    }

    // **** protected functions

    protected createRoutes() {
        // ABOUT
        /**
         * @swagger
         * /ippinger/about:
         *   get:
         *     summary: 
         *     description: .
         *     responses:
         *       200:
         *         description: 
         *         content:
         *           application/json:
         *             schema:
         *               type: object
         *               properties:
         *                 about:
         *                   type: string
         */
        this.app.route(`/ippinger/about`).get((req: express.Request, res: express.Response) => pinger_controller.getAbout(req, res, this._ip_pinger_ipaddress));

        // READ-CONFIG
        /**
         * @swagger
         * /ippinger/read-config:
         *   get:
         *     summary: 
         *     description: .
         *     responses:
         *       200:
         *         description: 
         *         content:
         *           application/json:
         *             schema:
         *               type: object
         *               properties:
         *                 about:
         *                   type: string
         */
        this.app.route(`/ippinger/read-config`).get((req: express.Request, res: express.Response) => pinger_controller.getReadConfig(req, res, this._ip_pinger_ipaddress));

        // WRITE-CONFIG
        /**
         * @swagger
         * /ippinger/write-config:
         *   post:
         *     summary: 
         *     description: .
         *     responses:
         *       200:
         *         description: 
         *         content:
         *           application/json:
         *             schema:
         *               type: object
         *               properties:
         *                 about:
         *                   type: string
         */
        this.app.route(`/ippinger/write-config`).post((req: express.Request, res: express.Response) => {
            const data = req.body;
            pinger_controller.postWriteConfig(req, res, this._ip_pinger_ipaddress, data);
        });

        // RESTART
        /**
         * @swagger
         * /ippinger/restart:
         *   post:
         *     summary: 
         *     description: .
         *     responses:
         *       200:
         *         description: 
         *         content:
         *           application/json:
         *             schema:
         *               type: object
         *               properties:
         *                 about:
         *                   type: string
         */
        this.app.route(`/ippinger/restart`).post((req: express.Request, res: express.Response) => pinger_controller.postRestart(req, res, this._ip_pinger_ipaddress));
    }
}
