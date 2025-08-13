import * as express from "express";
import { CreatorsBase } from "../common/creatorBase";
import { canLog } from "../common/systemFunctions";


// **** public classes

export class CreateMiddleware extends CreatorsBase {

    // **** ctor

    constructor(protected app: express.Application) {
        super(app);
    }

    // **** protected functions

    protected create() {
        // add middleware components
        this.app.use(this.loggerMiddleware);

        // TODO: add more middleware
    }

    // **** private functions

    private loggerMiddleware(request: express.Request, response: express.Response, next: any) {
        // check if logging is enabled
        if (canLog()) {
            // log the datetime, html verb and the requested path
            const dt = new Date();
            console.log(`[${dt.toLocaleDateString()} ${dt.toLocaleTimeString()}]\t${request.method}\t${request.path}`);
        }

        // continue 
        next();
    }
}
