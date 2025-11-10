import * as express from "express";
import { SqlError } from "mariadb";
import { Text } from "../models/contentTypes";
import { About } from "../models/generalModels";


// **** private variables

let logIt: boolean | undefined = undefined;


// **** public functions

export const aboutInformation: About = {
    name: 'Web Service Information',
    version: '2.0.0',
    author: 'dodson labs',
    description: 'Provides sensor-related web services.'
};


// **** logging

export function canLog(): boolean {


    return true;


    // // lazy-load environment variable
    // if (logIt === undefined) {
    //     logIt = process.env.TELEMETRY_SERVICE_LOG?.toLowerCase() === 'true';
    // }

    // // return value
    // return logIt;
}

export function log(message: string, elapsedTime: number | null = null, isError: boolean = false) {
    // check if logging is enabled
    if (canLog()) {
        const dt = new Date();
        const err = isError ? '\tERROR' : '\tSUCCESS';
        const seconds = (elapsedTime !== null) ? `\t[elapsed seconds: ${(elapsedTime / 1000).toString()}]` : '';

        console.log(`[${dt.toLocaleDateString()} ${dt.toLocaleTimeString()}]${err}${seconds}\n\t\t\tRESULTS ${message}`);
    }
}


// **** error handling

export function handleError(res: express.Response, status: number, error: unknown) {
    let message = '';

    // handle error
    if (error instanceof SqlError) {
        // handle sql error
        message = `${error.name}: ${error.sqlMessage}`;

        // TODO: check if (e) is a type of Error; if not, then display raw message
    } else {
        // handle generic error
        const e = (error as Error);
        message = `${e.name}: ${e.message}`;
    }

    // log it
    log(message, null, true);

    // send response
    res.status(status);
    res.contentType(Text);
    res.send(message);
}
