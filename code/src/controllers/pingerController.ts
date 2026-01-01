/*
 * Copyright (c) 2025 dodson Software ( dodson labs )
 * Author: Randy Dodson <dodsonsoftware@gmail.com>
 * Licensed under the MIT License with Patent Grant and NOTICE preservation.
 * See the LICENSE file for the full terms.
 */

import * as express from "express";
import { Json, OK, InternalServerError } from "../dodsonlabs/HttpConstants";
import { logger } from "../common/global";



// **** private functions

function fetchIt(res: express.Response, originator: string, url: string) {
    const origin = `${originator}/fetchIt`;

    const dude = fetch(url)
        .then(response => {
            // ---- check the response
            if (!response.ok) {
                // log it
                logger.write_error(origin, `Url=${url}, Response=${response}`);

                // publish it
                res.status(InternalServerError);
                res.contentType(Json);
                res.send(response);
                return null;
            }
            // next--> data as json
            return response.json();
        })
        .then(data => {
            // ---- process data as json
            // log it
            logger.write_debug(origin, `Url=${url}, Data=${JSON.stringify(data)}`);

            // publish it
            res.status(OK);
            res.contentType(Json);
            res.send(data);
        })
        .catch(error => {
            logger.write_error(origin, `Url: ${url}, Error=${error}`);
        });
}

function postIt(res: express.Response, originator: string, url: string, data: any) {
    const origin = `${originator}/postIt`;

    const dude = fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(data)

    }).then((response) => {
        // Check if the response is okay
        if (!response.ok) {
            // log it/throw error
            throw new Error(`HTTP error! Response=${response.status}::${response.statusText}`);
        }
        return response.json();

    }).then((result) => {
        // ---- process data as json
        // log it
        logger.write_debug(origin, `Data=${JSON.stringify(result)}`);

        // publish it
        res.status(OK);
        res.contentType(Json);
        res.send(result);

    }).catch((error) => {
        logger.write_error(origin, `Url: ${url}, Error=${error}`);
    });
}



// **** public functions

export function getAbout(req: express.Request, res: express.Response, ip_pinger_web_api: string) {
    // get {ip-pinger} web service api
    const url = `${ip_pinger_web_api}/about`;
    const originator = "pingerController.ts/getAbout";

    fetchIt(res, originator, url);
}

export function getReadConfig(req: express.Request, res: express.Response, ip_pinger_web_api: string) {
    // get {ip-pinger} web service api
    const url = `${ip_pinger_web_api}/read-config`;
    const originator = "pingerController.ts/getReadConfig";

    fetchIt(res, originator, url);
}

export function postWriteConfig(req: express.Request, res: express.Response, ip_pinger_web_api: string, data: any): void {
    // get {ip-pinger} web service api
    const url = `${ip_pinger_web_api}/write-config`;
    const originator = "pingerController.ts/postWriteConfig";

    postIt(res, originator, url, data);
}

export function postRestart(req: express.Request, res: express.Response, ip_pinger_web_api: string): void {
    // get {ip-pinger} web service api
    const url = `${ip_pinger_web_api}/restart`;
    const originator = "pingerController.ts/postRestart";

    postIt(res, originator, url, req.body);
}

export function getPing(req: express.Request, res: express.Response, ip_pinger_web_api: string, ping_ip_address: string): void {
    // get {ip-pinger} web service api
    const url = `${ip_pinger_web_api}/ping/${ping_ip_address}`;
    const originator = "pingerController.ts/getPing";

    fetchIt(res, originator, url);
}

export function getPings(req: express.Request, res: express.Response, ip_pinger_web_api: string): void {
    // get {ip-pinger} web service api
    const url = `${ip_pinger_web_api}/ping`;
    const originator = "pingerController.ts/getPing";

    fetchIt(res, originator, url);
}
