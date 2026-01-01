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



export const __routesHelp: Record<string, any> = {
    "description": "Apis that allow control over the registered IP Pinger.",
    "commands": [
        {
            "route": "/ippinger/about",
            "description": "Gets helpful information about the registered IP Pinger."
        },
        {
            "route": "/ippinger/read-config",
            "description": "Gets the current configuration from the registered IP Pinger."
        },
        {
            "route": "/ippinger/write-config",
            "description": "Posts the configuration, request.body, to the registered IP Pinger."
        },
        {
            "route": "/ippinger/restart",
            "description": "Instructs the registered IP Pinger service to restart."
        },
        {
            "route": "/ippinger/ping",
            "description": "Instructs the registered IP Pinger service to ping all of its devices and return the results."
        },
        {
            "route": "/ippinger/ping/{ip-address}",
            "description": "Instructs the registered IP Pinger service to ping the given ip-address and return the results."
        }
    ]
};

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

        // PING
        /**
         * @swagger
         * /ippinger/ping:
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
        this.app.route(`/ippinger/ping`).get((req: express.Request, res: express.Response) => pinger_controller.getPings(req, res, this._ip_pinger_ipaddress));


        // PING/{TARGET}
        /**
         * @swagger
         * /ippinger/ping/{target}:
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
        this.app.route(`/ippinger/ping/:target`).get((req: express.Request, res: express.Response) => pinger_controller.getPing(req, res, this._ip_pinger_ipaddress, req.params.target));
    }
}
