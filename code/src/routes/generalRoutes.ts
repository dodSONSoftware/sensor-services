import * as express from "express";
import { CreatorsBase } from "../common/creatorBase";
import * as general_controller from "../controllers/generalController";


// **** public classes

export class CreateRoutes extends CreatorsBase {

    // **** ctor

    constructor(protected app: express.Application) {
        super(app);
    }

    // **** protected functions

    protected create() {
        // ABOUT
        this.app.route('/about')
            .get((req: express.Request, res: express.Response) => general_controller.getAbout(req, res));

        // CURRENT DATETIME
        this.app.route('/date_local')
            .get((req: express.Request, res: express.Response) => general_controller.getDateCurrent(req, res));

        // UTC DATETIME
        this.app.route('/date_utc')
            .get((req: express.Request, res: express.Response) => general_controller.getDateUTC(req, res));


        // TODO: add more routes and functionality

    }
}
