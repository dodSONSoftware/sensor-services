/*
 * Copyright (c) 2025-2026 dodson Software ( dodson labs )
 * Author: Randy Dodson <dodsonsoftware@gmail.com>
 * Licensed under the MIT License with Patent Grant and NOTICE preservation.
 * See the LICENSE file for the full terms.
 */

import { resolve } from "path";
import express from "express";
import { setupSwagger } from "./swagger";
import * as ipAddress from "ip";
import * as middleware from "./middleware/middleware";
import * as generalRoutes from "./routes/generalRoutes";
import * as sensorRoutes from "./routes/sensorRoutes";
import * as pingerRoutes from "./routes/pingerRoutes";
import { CreateRouteNotFound } from "./routes/routeNotFound";
import { aboutDude, createLogger, logger } from "./common/global";

// Guard: logger must be initialized before any module-level code uses it.
// createLogger() is called below; this check catches misconfiguration.
import { ensureError, formatElapsedTime, read_file_yaml } from "./dodsonlabs/SystemFunctions";
import { validateConfig, configSchema } from "./schemas/config";
import type { z } from "zod";
import { MqttNetworking } from "./dodsonlabs/MqttNetworking";

// **** route drift validation

function validateRoutesHelp(name: string, routes: string[], help: Record<string, unknown>) {
    const cmds = ((help as Record<string, unknown>).commands as { route: string }[] ?? []);
    const helpRoutes = cmds.map((c: { route: string }) => c.route);
    const missing = helpRoutes.filter((r: string) => !routes.includes(r));
    const extra = routes.filter((r: string) => !helpRoutes.includes(r));
    if (missing.length || extra.length) {
        appLogger.write_error("index.ts/validateRoutesHelp",
            `${name}: __routesHelp drift detected — ` +
            `missing in __routes: ${missing.join(", ") || "none"}, ` +
            `extra in __routes: ${extra.join(", ") || "none"}`);
    }
}

// **** configuration validation

function validate_config(raw: unknown): z.infer<typeof configSchema> {
    try {
        return validateConfig(raw);
    } catch (err) {
        const message = ensureError(err).message;
        // eslint-disable-next-line no-console
        console.error(`ERROR: Invalid config.yml — ${message}`);
        process.exit(1);
    }
}

// **** start up code

// read the configuration file
const rawConfig = read_file_yaml("/app/dist/config.yml") ?? read_file_yaml("./dist/config.yml");
if (rawConfig === null) {
    // eslint-disable-next-line no-console
    console.error("ERROR: Could not read config.yml — cannot start without configuration.");
    process.exit(1);
}

// validate and type the config with Zod
const config = validate_config(rawConfig);

// create logger
createLogger(config);
const appLogger = logger()!;

// display configuration
appLogger.write_info("index.ts", `>>>>>>>> CONFIGURATION:\n${JSON.stringify(config, null, 2)}\n================================================================\n`);

// log it
const dude = aboutDude();
appLogger.write_debug("index.ts", `${dude.about.name} v${dude.about.version} starting...`);

// create express application
const app = express();

// create networking
const networking = new MqttNetworking(config, appLogger);

// get express port (before swagger so the server URL is correct)
const port = process.env.EXPRESS_PORT !== undefined ? Number(process.env.EXPRESS_PORT) : 32000;

// setup swagger (auto-derived from machine IP + port, overridable via config)
// Resolve source dir relative to CWD so the glob finds .ts files regardless of WORKDIR
const srcDir = resolve(process.cwd(), "..");
const swagger_server_url = config["swagger-server-url"] as string | undefined;
setupSwagger(app, port, srcDir, swagger_server_url);

try {
    // create middleware
    new middleware.CreateMiddleware(app);

    // create routes
    const ip_pinger_web_api = config["ip-pinger-web-api"];
    const case_sensitive = config["case-sensitive"];

    new generalRoutes.CreateGeneralRoutes(app, networking.is_connected());
    new sensorRoutes.CreateSensorRoutes(app, networking);
    new pingerRoutes.CreatePingerRoutes(app, networking, ip_pinger_web_api, case_sensitive);
    new CreateRouteNotFound(app);

    // Validate __routesHelp entries match __routes arrays
    validateRoutesHelp("generalRoutes", generalRoutes.__routes, generalRoutes.__routesHelp);
    validateRoutesHelp("sensorRoutes", sensorRoutes.__routes, sensorRoutes.__routesHelp);
    validateRoutesHelp("pingerRoutes", pingerRoutes.__routes, pingerRoutes.__routesHelp);
} catch (err: unknown) {
    // log error
    appLogger.write_error("index.ts", ensureError(err).message);

    // terminate application
    process.exit(1);
}

// start express
const server = app.listen(port, () => {
    appLogger.write_debug("index.ts", `${dude.about.name} v${dude.about.version} started.`);
    appLogger.write_info("index.ts", `******** ${dude.about.name} v${dude.about.version} listening on http://${ipAddress.address()}:${port} ********`);
});

// **** graceful shutdown

const start_time = Date.now();

async function shutdown(signal: string): Promise<void> {
    appLogger.write_info("index.ts", `Received ${signal}. Starting graceful shutdown...`);

    // stop accepting new HTTP requests
    server.close(async () => {
        appLogger.write_info("index.ts", "HTTP server closed. No new requests accepted.");

        // disconnect MQTT and close Prometheus writer
        networking.close();

        appLogger.write_info("index.ts", `Graceful shutdown complete. Uptime: ${formatElapsedTime(Date.now() - start_time)}.`);
        process.exit(0);
    });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
