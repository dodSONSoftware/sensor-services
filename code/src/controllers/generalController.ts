/*
 * Copyright (c) 2025-2026 dodson Software ( dodson labs )
 * Author: Randy Dodson <dodsonsoftware@gmail.com>
 * Licensed under the MIT License with Patent Grant and NOTICE preservation.
 * See the LICENSE file for the full terms.
 */

import * as express from "express";
import { Json, OK, Text } from "../dodsonlabs/HttpConstants";
import { aboutDude, logger } from "../common/global";

// **** public functions

export function getAbout(req: express.Request, res: express.Response) {
    const dude = aboutDude();

    // log it
    logger.write_debug("generalController.ts/getAbout", JSON.stringify(dude));

    // publish it
    res.status(OK);
    res.contentType(Json);
    res.send(dude);
}

export function getDateCurrent(req: express.Request, res: express.Response) {
    // get UTC date-time string
    const dt = new Date();
    const t = dt.toTimeString().split(" ")[0];
    const y = dt.getFullYear().toString().padStart(2, "0");
    const m = dt.getMonth().toString().padStart(2, "0");
    const d = dt.getDate().toString().padStart(2, "0");
    const final = `${y}-${m}-${d}T${t}`;

    // log it
    logger.write_debug("generalController.ts/getDateCurrent", `(${final})`);

    // publish it
    res.status(OK);
    res.contentType(Text);
    res.send(final);
}

export function getDateUTC(req: express.Request, res: express.Response) {
    // get UTC date-time string
    const dt = new Date().toISOString().split(".")[0];

    // log it
    logger.write_debug("generalController.ts/getDateUTC", `(${dt})`);

    // publish it
    res.status(OK);
    res.contentType(Text);
    res.send(dt);
}
