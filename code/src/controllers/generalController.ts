import * as express from "express";
import { OK } from "../models/errorCodes";
import { Json, Text } from "../models/contentTypes";
import { aboutInformation, log } from "../common/systemFunctions";


// **** public functions

export function getAbout(req: express.Request, res: express.Response) {
    // log it
    log(JSON.stringify(aboutInformation), 0);

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
    log(final);

    // publish it
    res.status(OK);
    res.contentType(Text);
    res.send(final);
}

export function getDateUTC(req: express.Request, res: express.Response) {
    // get UTC date-time string
    const dt = (new Date()).toISOString().split('.')[0];

    // log it
    log(dt);

    // publish it
    res.status(OK);
    res.contentType(Text);
    res.send(dt);
}
