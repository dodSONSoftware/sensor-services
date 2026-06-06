/*
 * Copyright (c) 2025-2026 dodson Software ( dodson labs )
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
import * as pingerRoutes from "./routes/pingerRoutes";
import { CreateRouteNotFound } from "./routes/routeNotFound";
import { aboutDude, createLogger, logger } from "./common/global";
import { ensureError, read_file_json } from "./dodsonlabs/SystemFunctions";
import { MqttNetworking } from "./dodsonlabs/MqttNetworking";

// **** configuration validation

function validate_config(config: Record<string, unknown>): void {
    // required string keys
    const required_strings = [
        "mqtt-broker-ip-address",
        "mqtt-topic-telemetry",
        "mqtt-topic-command",
        "mqtt-topic-command-response",
        "ip-pinger-web-api",
    ];
    for (const key of required_strings) {
        if (!(key in config) || typeof config[key] !== "string" || (config[key] as string).length === 0) {
            console.error(`ERROR: config.json missing or empty required string key "${key}".`);
            process.exit(1);
        }
    }

    // validate MQTT broker IP format
    const ip_regex = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
    const mqtt_ip = config["mqtt-broker-ip-address"] as string;
    if (!ip_regex.test(mqtt_ip)) {
        console.error(`ERROR: config.json "mqtt-broker-ip-address" (${mqtt_ip}) is not a valid IPv4 address.`);
        process.exit(1);
    }

    // validate ip-pinger URL format
    const url_regex = /^https?:\/\/\S+$/;
    const ip_pinger_url = config["ip-pinger-web-api"] as string;
    if (!url_regex.test(ip_pinger_url)) {
        console.error(`ERROR: config.json "ip-pinger-web-api" (${ip_pinger_url}) is not a valid URL.`);
        process.exit(1);
    }

    // required number keys
    const required_numbers = ["prometheus-port"];
    for (const key of required_numbers) {
        if (!(key in config) || typeof config[key] !== "number" || !Number.isInteger(config[key]) || config[key] <= 0) {
            console.error(`ERROR: config.json missing or invalid required number key "${key}".`);
            process.exit(1);
        }
    }

    // required boolean keys
    const required_booleans = ["case-sensitive"];
    for (const key of required_booleans) {
        if (!(key in config) || typeof config[key] !== "boolean") {
            console.error(`ERROR: config.json missing or invalid required boolean key "${key}".`);
            process.exit(1);
        }
    }
}

// **** start up code

// read the configuration file
const config = read_file_json("/app/dist/config.json");
if (config === null) {
    console.error("ERROR: Could not read /app/dist/config.json — cannot start without configuration.");
    process.exit(1);
}
validate_config(config);

// display configuration
console.log(`>>>>>>>> CONFIGURATION:\n${JSON.stringify(config, null, 2)}\n================================================================\n`);

// create logger
createLogger(config);

// log it
const dude = aboutDude();
logger.write_debug("index.ts", `${dude.about.name} v${dude.about.version} starting...`);

// create express application
const app = express();

// create networking
const networking = new MqttNetworking(config, logger);

// get express port (before swagger so the server URL is correct)
const port = Number(process.env.EXPRESS_PORT) || 32000;

// setup swagger (auto-derived from machine IP + port, overridable via config)
const swagger_server_url = config["swagger-server-url"] as string | undefined;
setupSwagger(app, port, swagger_server_url);

try {
    // create middleware
    new middleware.CreateMiddleware(app);

    // create routes
    const ip_pinger_web_api = String(config["ip-pinger-web-api"]);
    const case_sensitive = config["case-sensitive"] === true;

    new generalRoutes.CreateGeneralRoutes(app);
    new sensorRoutes.CreateSensorRoutes(app, networking, ip_pinger_web_api);
    new pingerRoutes.CreatePingerRoutes(app, networking, ip_pinger_web_api, case_sensitive);
    new CreateRouteNotFound(app);
} catch (err: any) {
    // log error
    logger.write_error("index.ts", ensureError(err).message);

    // terminate application
    process.exit(1);
}

// start express
app.listen(port, () => {
    logger.write_debug("index.ts", `${dude.about.name} v${dude.about.version} started.`);
    logger.write_info("index.ts", `******** ${dude.about.name} v${dude.about.version} listening on http://${ipAddress.address()}:${port} ********`);
});
