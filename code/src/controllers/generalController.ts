/*
 * Author: Randy Dodson ( dodson labs )
 * License: 2025, MIT License (see LICENSE file for details)
 */

import * as express from "express";
import { Json, OK, Text } from "../dodsonlabs/HttpConstants";
import { aboutInformation, logger } from "../common/global";


// **** public functions

export function getAbout(req: express.Request, res: express.Response) {
    // log it
    logger.write_info("generalController.ts/getAbout", JSON.stringify(aboutInformation));

    // publish it
    res.status(OK);
    res.contentType(Json);
    res.send(aboutInformation);
}

export function getDateCurrent(req: express.Request, res: express.Response) {
    // get UTC date-time string
    const dt = new Date();
    const t = dt.toTimeString().split(' ')[0];
    const y = dt.getFullYear().toString().padStart(2, '0');
    const m = dt.getMonth().toString().padStart(2, '0');;
    const d = dt.getDate().toString().padStart(2, '0');;
    const final = `${y}-${m}-${d}T${t}`;

    // log it
    logger.write_info("generalController.ts/getDateCurrent", `(${final})`);

    // publish it
    res.status(OK);
    res.contentType(Text);
    res.send(final);
}

export function getDateUTC(req: express.Request, res: express.Response) {
    // get UTC date-time string
    const dt = (new Date()).toISOString().split('.')[0];

    // log it
    logger.write_info("generalController.ts/getDateUTC", `(${dt})`);

    // publish it
    res.status(OK);
    res.contentType(Text);
    res.send(dt);
}
