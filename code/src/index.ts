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
import * as logRoutes from "./routes/logRoutes";
import { assertRoutesMatchDeclared } from "./routes/routeDrift";
import { aboutDude, createLogger, logger, setConfig } from "./common/global";
import type { Logger } from "./dodsonlabs/Logger";
import { createApiMetricsMiddleware } from "./common/metrics";
import { formatFatalError, runGracefulShutdown } from "./common/shutdown";

// Guard: logger must be initialized before any module-level code uses it.
// createLogger() is called below; this check catches misconfiguration.
import { ensureError } from "./dodsonlabs/SystemFunctions";
import { redactConfig, resolveIppingerFetchTimeoutMs, validateConfig, type configSchema } from "./schemas/config";
import { readConfigWithSecrets } from "./schemas/configLoader";
import fs from "fs";
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
    // Read the configuration file (try container mount first, then CWD-relative),
    // merging in an optional sibling config-secrets.yml. The base file holds no
    // real secrets; credentials live in the gitignored config-secrets.yml.
    const CONFIG_BASE_PATHS = ["/app/configs/config.yml", "./dist/config.yml"];
    const baseConfigPath = CONFIG_BASE_PATHS.find((p) => {
        try {
            fs.accessSync(p);
            return true;
        } catch {
            return false;
        }
    });
    if (!baseConfigPath) {
        // eslint-disable-next-line no-console
        console.error(`ERROR: Could not find config.yml (tried: ${CONFIG_BASE_PATHS.join(", ")}) — cannot start without configuration.`);
        process.exit(1);
    }

    const configResult = readConfigWithSecrets(baseConfigPath);
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

    // display configuration (secrets masked — this line also goes to Loki when enabled)
    appLogger.write_info("index.ts", `CONFIGURATION:\n${JSON.stringify(redactConfig(config), null, 2)}`);

    // log it
    const dude = aboutDude();
    appLogger.write_info("index.ts", `${dude.about.name} v${dude.about.version} starting...`);

    // create express application
    const app = express();

    // create networking
    const networking = new MqttNetworking(config, appLogger);

    // get express port (before swagger so the server URL is correct)
    const port = config["express-port"];

    // **** Settings initialization (PostgreSQL-backed persistence, before routes)

    // Initialize settings synchronously before routes are registered
    // If DB is unavailable, graceful degradation provides in-memory defaults
    try {
        await settingsStore.init(config);
    } catch (err: unknown) {
        appLogger.write_warn("index.ts", `Settings persistence failed (${ensureError(err).message}). Running with in-memory defaults.`);
    }

    try {
        // create middleware. The API metrics middleware is passed in (rather
        // than app.use()'d here) so it is installed AHEAD of the rate limiter —
        // that ordering is what makes 429 responses carry an X-Request-ID and
        // be counted (P3-2). Registry and metrics live in common/metrics.ts so
        // they can also be used by route handlers (e.g. generalRoutes.ts).
        // Unmatched requests are recorded under the bounded "unmatched" label.
        new middleware.CreateMiddleware(app, config, createApiMetricsMiddleware());

        // setup swagger AFTER the global middleware so it does not bypass the
        // request-ID / metrics / CORS / rate-limit / body-validation pipeline
        // (P3-2), but BEFORE the application routes.
        // Resolve source dir relative to __dirname (compiled output directory).
        // Since __dirname is /app/dist/ in Docker, ../src gives us /app/src/.
        // The swagger.ts buildApisArray adds another "src/" so we pass the parent dir.
        const srcDir = resolve(__dirname, "..");
        const swagger_server_url = config["swagger-server-url"] as string | undefined;
        setupSwagger(app, port, srcDir, swagger_server_url);

        // create routes
        const ip_pinger_web_api = config["ip-pinger-web-api"];
        const case_sensitive = config["case-sensitive"];

        new generalRoutes.CreateGeneralRoutes(app, networking);
        new sensorRoutes.CreateSensorRoutes(app, networking);
        // ippinger-fetch-timeout-ms (Optional-2) with the deprecated
        // fetch-timeout-ms alias and the 10-second default.
        new pingerRoutes.CreatePingerRoutes(app, networking, ip_pinger_web_api, case_sensitive, resolveIppingerFetchTimeoutMs(config));

        new settingsRoutes.CreateSettingsRoutes(app);
        new configRoutes.CreateConfigRoutes(app);
        new logRoutes.CreateLogRoutes(app);
        new CreateRouteNotFound(app);

        // Validate __routesHelp entries match __routes arrays (per-module
        // static consistency: every declared route has help text and vice versa).
        validateRoutesHelp("generalRoutes", generalRoutes.__routes, generalRoutes.__routesHelp);
        validateRoutesHelp("sensorRoutes", sensorRoutes.__routes, sensorRoutes.__routesHelp);
        validateRoutesHelp("pingerRoutes", pingerRoutes.__routes, pingerRoutes.__routesHelp);
        validateRoutesHelp("settingsRoutes", settingsRoutes.__routes, settingsRoutes.__routesHelp);
        validateRoutesHelp("configRoutes", configRoutes.__routes, configRoutes.__routesHelp);
        validateRoutesHelp("logRoutes", logRoutes.__routes, logRoutes.__routesHelp);

        // Validate the DECLARED metadata against the LIVE Express app (P3-4):
        // the union of every module's __routes must be exactly the set of
        // routes actually registered. The per-module check above only compares
        // static metadata to static metadata; this catches a route registered
        // but never declared, or declared but never registered.
        assertRoutesMatchDeclared(app, {
            generalRoutes: generalRoutes.__routes,
            sensorRoutes: sensorRoutes.__routes,
            pingerRoutes: pingerRoutes.__routes,
            settingsRoutes: settingsRoutes.__routes,
            configRoutes: configRoutes.__routes,
            logRoutes: logRoutes.__routes,
        });
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

    // Re-entrancy guard: a second signal or fatal error mid-shutdown must not
    // re-run the sequence (which would duplicate the logger close).
    let shutting_down = false;

    // exitCode: 0 for a clean, operator-requested stop (SIGINT/SIGTERM); 1 for a
    // fatal fault (uncaughtException / unhandledRejection) so a supervisor or
    // Docker can tell a crash from a deliberate stop.
    async function shutdown(signal: string, exitCode: number = 0): Promise<void> {
        if (shutting_down) {
            return;
        }
        shutting_down = true;

        appLogger.write_info("index.ts", `Received ${signal}. Starting graceful shutdown...`);

        // Set a hard timeout as a safety net to prevent hanging forever.
        // It is cleared before the exit so it can never fire after the logger
        // has been closed by runGracefulShutdown().
        const hardTimeout = setTimeout(() => {
            appLogger.write_error("index.ts", `Hard shutdown timeout reached (${__hard_shutdown_timeout_ms}ms). Forcing exit.`);
            process.exit(1);
        }, __hard_shutdown_timeout_ms);
        hardTimeout.unref();

        try {
            // 1-4: close the HTTP server, MQTT client, and settings store,
            // then the active logger exactly once (see common/shutdown.ts)
            await runGracefulShutdown(
                {
                    closeHttpServer: () => new Promise<void>((resolve) => {
                        server.close(() => {
                            appLogger.write_info("index.ts", "HTTP server closed. No new requests accepted.");
                            resolve();
                        });
                    }),
                    closeNetworking: (timeoutMs: number) => networking.close(timeoutMs),
                    closeSettingsStore: () => settingsStore.shutdown(),
                },
                appLogger,
                start_time
            );
        } finally {
            clearTimeout(hardTimeout);
            process.exit(exitCode);
        }
    }

    // A bind failure (e.g. EADDRINUSE) means the HTTP server never started — a
    // fatal startup error. Log it and exit non-zero so a supervisor restarts us
    // rather than leaving a process alive that serves nothing.
    server.on("error", (err: NodeJS.ErrnoException) => {
        appLogger.write_error("index.ts", `HTTP server error: ${ensureError(err).message}${err.code ? ` (${err.code})` : ""}`);
        process.exit(1);
    });

    // Clean, operator-requested stop -> exit 0
    process.on("SIGTERM", () => shutdown("SIGTERM", 0));
    process.on("SIGINT", () => shutdown("SIGINT", 0));
    // Fatal faults -> exit 1 (so a crash is distinguishable from a clean stop).
    // Both values are normalized through formatFatalError (Optional-1): a
    // non-Error thrown/rejected value can never log as "undefined".
    process.on("uncaughtException", (err) => {
        appLogger.write_error("index.ts/uncaughtException", formatFatalError("Uncaught exception", err));
        shutdown("uncaughtException", 1);
    });
    process.on("unhandledRejection", (reason) => {
        appLogger.write_error("index.ts/unhandledRejection", formatFatalError("Unhandled rejection", reason));
        shutdown("unhandledRejection", 1);
    });
})();
