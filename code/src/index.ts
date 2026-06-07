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
import { Counter, Histogram } from "prom-client";

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
appLogger.write_info("index.ts", `CONFIGURATION:\n${JSON.stringify(config, null, 2)}`);

// log it
const dude = aboutDude();
appLogger.write_info("index.ts", `${dude.about.name} v${dude.about.version} starting...`);

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

    // **** API Prometheus metrics

    // Total HTTP requests by method, route, status code
    const httpRequestsTotal = new Counter({
        name: "http_requests_total",
        help: "Total number of HTTP requests.",
        labelNames: ["method", "route", "status"],
    });

    // HTTP request duration in seconds by method and route
    const httpRequestDuration = new Histogram({
        name: "http_request_duration_seconds",
        help: "HTTP request duration in seconds.",
        labelNames: ["method", "route"],
        buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    });

    // HTTP 5xx errors by method and route
    const httpErrorsTotal = new Counter({
        name: "http_errors_total",
        help: "Total number of HTTP 5xx errors.",
        labelNames: ["method", "route"],
    });

    // Track request duration and status, record metrics after response is sent
    app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
        const start = process.hrtime();

        // Wrap res.end to capture the final status code
        const originalEnd = res.end;
        const trackedRes = res as express.Response & { _ended?: boolean };
        trackedRes._ended = false;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        res.end = function (this: any, ...args: any[]) {
            if (!trackedRes._ended) {
                trackedRes._ended = true;

                const [sec, nsec] = process.hrtime(start);
                const duration = sec + nsec / 1e9;

                const method = req.method;
                // Use the matched route pattern (e.g., /sensors/identify/:source)
                const route = req.route ? req.route.path : req.path;
                const status = res.statusCode;

                httpRequestsTotal.labels({ method, route, status }).inc();
                httpRequestDuration.labels({ method, route }).observe(duration);

                if (status >= 500) {
                    httpErrorsTotal.labels({ method, route }).inc();
                }
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-this-alias
            return (originalEnd as any).apply(this, args);
        } as typeof res.end;

        next();
    });

    // create routes
    const ip_pinger_web_api = config["ip-pinger-web-api"];
    const case_sensitive = config["case-sensitive"];

    new generalRoutes.CreateGeneralRoutes(app, networking);
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
    appLogger.write_info("index.ts", `${dude.about.name} v${dude.about.version} started.`);
    appLogger.write_info("index.ts", `${dude.about.name} v${dude.about.version} listening on http://${ipAddress.address()}:${port}`);
});

// **** graceful shutdown

const start_time = Date.now();

// Hard shutdown timeout — if graceful shutdown hangs, force exit.
const __hard_shutdown_timeout_ms = 15_000;

async function shutdown(signal: string): Promise<void> {
    appLogger.write_info("index.ts", `Received ${signal}. Starting graceful shutdown...`);

    // Set a hard timeout as a safety net to prevent hanging forever.
    const hardTimeout = setTimeout(() => {
        appLogger.write_error("index.ts", `Hard shutdown timeout reached (${__hard_shutdown_timeout_ms}ms). Forcing exit.`);
        process.exit(1);
    }, __hard_shutdown_timeout_ms);
    hardTimeout.unref();

    try {
        // 1. Stop accepting new HTTP requests
        await new Promise<void>((resolve) => {
            server.close(() => {
                appLogger.write_info("index.ts", "HTTP server closed. No new requests accepted.");
                resolve();
            });
        });

        // 2. Flush Prometheus metrics before closing the metrics server
        await networking.prometheus_flush();

        // 3. Close MQTT client with a timeout
        networking.close(5000);

        appLogger.write_info("index.ts", `Graceful shutdown complete. Uptime: ${formatElapsedTime(Date.now() - start_time)}.`);
    } catch (err) {
        appLogger.write_error("index.ts", `Error during graceful shutdown: ${(err as Error).message}`);
    } finally {
        clearTimeout(hardTimeout);
        process.exit(0);
    }
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
