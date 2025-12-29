/*
 * Copyright (c) 2025 dodson Software ( dodson labs )
 * Author: Randy Dodson <dodsonsoftware@gmail.com>
 * Licensed under the MIT License with Patent Grant and NOTICE preservation.
 * See the LICENSE file for the full terms.
 */

import express from "express";
import { setupSwagger } from "./swagger";
import * as ipAddress from "ip";
import * as middleware from "./middleware/middleware";
import * as generalRoutes from "./routes/generalRoutes";
import * as sensorRoutes from "./routes/sensorRoutes";
import { aboutInformation, createLogger, logger } from "./common/global";
import { ensureError, read_file_json } from "./dodsonlabs/SystemFunctions";
import { MqttNetworking } from "./dodsonlabs/MqttNetworking";

// **** start up code

// read the configuration file
let config_source = "file";
let config = read_file_json("/app/dist/config.json");
if (config === null) {
    // could not find the configuration file
    console.log("\n================================================================");
    console.log(">>>>>>>> WARNING");
    console.log(`>>>>>>>> WARNING: Could not read the configuration file, using coded configuration...`);
    console.log(">>>>>>>> WARNING");
    console.log(">>>>>>>>");

    config_source = "code";
    config = {
        "log-level": "debug",
        "prometheus-port": 3301,
        "mqtt-broker-ip-address": "192.168.1.4",
        "mqtt-topic-telemetry": "iot/v2/telemetry",
        "mqtt-topic-command": "iot/v2/command",
        "mqtt-topic-command-response": "iot/v2/command-response",
    };
}

// display configuration
console.log(`>>>>>>>> CONFIGURATION [ ${config_source} ]:\n${JSON.stringify(config, null, 2)}\n================================================================\n`);

// create logger
createLogger(config);

// log it
logger.write_debug("index.ts", `${aboutInformation.name} v${aboutInformation.version} starting...`);

// create express application
const app = express();

// create networking
const networking = new MqttNetworking(config, logger);
networking.start_networking();

// setup swagger
setupSwagger(app);

try {
    // create middleware
    new middleware.CreateMiddleware(app);

    // create routes
    new generalRoutes.CreateGeneralRoutes(app);
    new sensorRoutes.CreateSensorRoutes(app, networking);
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
