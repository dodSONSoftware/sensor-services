/*
 * Author: Randy Dodson ( dodson labs )
 * License: 2025, MIT License (see LICENSE file for details)
 */

import express from "express";
import { setupSwagger } from './swagger';
import * as ipAddress from "ip";
import * as middleware from "./middleware/middleware";
import * as generalRoutes from "./routes/generalRoutes";
import { aboutInformation, createLogger, logger } from "./common/global";
import { ensureError, read_file_json } from "./dodsonlabs/SystemFunctions";



// **** start up code

// read the configuration file
let config_source = 'file';
let config = read_file_json("./config.json");
if (config === null) {
    // could not find the configuration file
    config_source = 'code';
    config = {
        "log-level": "debug"
    };
}
// display configuration
console.log(`>>>>>>>> CONFIGURATION [ ${config_source} ]:\n${JSON.stringify(config, null, 2)}\n>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>`);

// create logger
createLogger(config);

// log it
logger.write_debug("index.ts", `${aboutInformation.name} v${aboutInformation.version} starting...`);

// create express application
const app = express();

// setup swagger
setupSwagger(app);

try {
    // create middleware
    new middleware.CreateMiddleware(app);

    // create routes
    new generalRoutes.CreateRoutes(app);

    // TODO: add more routes and functionality

} catch (err: any) {
    // log error
    logger.write_error("index.ts", ensureError(err).message);

    // terminate application
    process.exit(1);
}

// get express port
const port = Number(process.env.EXPRESS_PORT) || 32000;

// start express
app.listen(port, () => {
    logger.write_debug("index.ts", `${aboutInformation.name} v${aboutInformation.version} started.`);
    logger.write_info("index.ts", `******** ${aboutInformation.name} v${aboutInformation.version} listening on ${ipAddress.address()}:${port} ********`);
});
