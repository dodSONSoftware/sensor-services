/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
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
import * as settingsRoutes from "./routes/settingsRoutes";
import * as configRoutes from "./routes/configRoutes";
import { aboutDude, createLogger, logger, setConfig } from "./common/global";
import type { Logger } from "./dodsonlabs/Logger";
import { InternalServerError } from "./dodsonlabs/HttpConstants";
import {
    httpRequestsTotal,
    httpRequestDuration,
    httpErrorsTotal,
} from "./common/metrics";

// Guard: logger must be initialized before any module-level code uses it.
// createLogger() is called below; this check catches misconfiguration.
import { ensureError, formatElapsedTime, read_file_yaml } from "./dodsonlabs/SystemFunctions";
import { validateConfig, type configSchema } from "./schemas/config";
import type { z } from "zod";
import { MqttNetworking } from "./dodsonlabs/MqttNetworking";
import * as settingsStore from "./services/settingsStore";

// **** route drift validation

function validateRoutesHelp(name: string, routes: string[], help: Record<string, unknown>) {
    const cmds = ((help as Record<string, unknown>).commands as { route: string }[] ?? []);
    const helpRoutes = cmds.map((c: { route: string }) => c.route);
    const missing = helpRoutes.filter((r: string) => !routes.includes(r));
    const extra = routes.filter((r: string) => !helpRoutes.includes(r));
    if (missing.length || extra.length) {
        throw new Error(
            `${name}: __routesHelp drift detected — ` +
            `missing in __routes: ${missing.join(", ") || "none"}, ` +
            `extra in __routes: ${extra.join(", ") || "none"}`
        );
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

(async () => {
    // read the configuration file (try container mount first, then CWD-relative)
    let configResult = read_file_yaml<z.infer<typeof configSchema>>(
        "/app/configs/config.yml"
    );
    if (configResult.data === null) {
        configResult = read_file_yaml<z.infer<typeof configSchema>>("./dist/config.yml");
    }
    if (configResult.data === null) {
        // eslint-disable-next-line no-console
        console.error(`ERROR: Could not read config.yml — ${configResult.error ?? "unknown error"} — cannot start without configuration.`);
        process.exit(1);
    }

    // validate and type the config with Zod
    const config = validate_config(configResult.data);

    // Store config in global storage for hot-reload support
    setConfig(config);

    // create logger
    createLogger(config);
    // createLogger(config) above guarantees logger() returns a defined Logger
    const appLogger = logger() as Logger;

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
    const port = config["express-port"];

    // setup swagger (auto-derived from machine IP + port, overridable via config)
    // Resolve source dir relative to __dirname (compiled output directory).
    // Since __dirname is /app/dist/ in Docker, ../src gives us /app/src/.
    // The swagger.ts buildApisArray adds another "src/" so we pass the parent dir.
    const srcDir = resolve(__dirname, "..");
    const swagger_server_url = config["swagger-server-url"] as string | undefined;
    setupSwagger(app, port, srcDir, swagger_server_url);

    // **** Settings initialization (PostgreSQL-backed persistence, before routes)

    // Initialize settings synchronously before routes are registered
    // If DB is unavailable, graceful degradation provides in-memory defaults
    try {
        await settingsStore.init(config);
    } catch (err: unknown) {
        appLogger.write_warn("index.ts", `Settings persistence failed (${ensureError(err).message}). Running with in-memory defaults.`);
    }

    try {
        // create middleware
        new middleware.CreateMiddleware(app, config);

        // **** API Prometheus metrics (separate registry, exposed at /metrics)
        // Registry and metrics are imported from common/metrics.ts so they can
        // also be used by route handlers (e.g. generalRoutes.ts).

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

                    if (status >= InternalServerError) {
                        httpErrorsTotal.labels({ method, route }).inc();
                    }
                }
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                return (originalEnd as any).apply(this, args);
            } as typeof res.end;

            next();
        });

        // create routes
        const ip_pinger_web_api = config["ip-pinger-web-api"];
        const case_sensitive = config["case-sensitive"];

        new generalRoutes.CreateGeneralRoutes(app, networking);
        new sensorRoutes.CreateSensorRoutes(app, networking);
        new pingerRoutes.CreatePingerRoutes(app, networking, ip_pinger_web_api, case_sensitive, config["fetch-timeout-ms"] ?? 10_000);

        new settingsRoutes.CreateSettingsRoutes(app);
        new configRoutes.CreateConfigRoutes(app);
        new CreateRouteNotFound(app);

        // Validate __routesHelp entries match __routes arrays
        validateRoutesHelp("generalRoutes", generalRoutes.__routes, generalRoutes.__routesHelp);
        validateRoutesHelp("sensorRoutes", sensorRoutes.__routes, sensorRoutes.__routesHelp);
        validateRoutesHelp("pingerRoutes", pingerRoutes.__routes, pingerRoutes.__routesHelp);
        validateRoutesHelp("settingsRoutes", settingsRoutes.__routes, settingsRoutes.__routesHelp);
        validateRoutesHelp("configRoutes", configRoutes.__routes, configRoutes.__routesHelp);
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

            // 2. Close MQTT client with a timeout
            await networking.close(5000);

            // 3. Clean up persistence resources
            await settingsStore.shutdown();

            // 4. Shutdown complete — gauges are in-memory and always available via /metrics
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
    process.on("uncaughtException", (err) => {
        appLogger.write_error("index.ts/uncaughtException", `Uncaught exception: ${(err as Error).message}\n${(err as Error).stack ?? ""}`);
        shutdown("uncaughtException");
    });
    process.on("unhandledRejection", (reason, _promise) => {
        const message = ensureError(reason).message;
        appLogger.write_error("index.ts/unhandledRejection", `Unhandled rejection: ${message}`);
        shutdown("unhandledRejection");
    });
})();
