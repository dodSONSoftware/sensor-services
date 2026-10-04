/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import { AsyncLocalStorage } from "async_hooks";
import { Logger } from "../dodsonlabs/Logger";
import type { configSchema } from "../schemas/config";
import type { z } from "zod";
import { APP_NAME, APP_VERSION } from "../version";

// **** public functions

let _logger: Logger | undefined;
let _config: z.infer<typeof configSchema> | undefined;

export function setLogger(l: Logger) { _logger = l; }
export const logger = () => _logger;

export const createLogger = (config: z.infer<typeof configSchema>) => {
    // Startup only — config reload must NOT replace the logger (see
    // Logger.setLevel): long-lived components hold references to the
    // instance created here, and closing it on a reload would leave them
    // logging through a dead logger. Closing the previous instance is a
    // safety net for any accidental second creation.
    const previous = _logger;
    if (previous) {
        previous.close();
    }
    setLogger(new Logger(config));
    return _logger;
};

// **** config storage for hot-reload support

export function getConfig() { return _config; }
export function setConfig(cfg: z.infer<typeof configSchema>) { _config = cfg; }

// ---- Request ID propagation via AsyncLocalStorage

export const _reqIdStore = new AsyncLocalStorage<string>();

/**
 * Return the current request's ID, or "none" if outside a request context.
 * (Kept as a no-op stub for callers that may import it; the middleware
 *  now manages the store directly via `run()`.)
 */
export const setReqIdStore = (_id: string) => {
    // No-op — the middleware wraps `next()` in `_reqIdStore.run()`
    // so the store is managed at the middleware level.
};

/**
 * Return the current request's ID, or "none" if outside a request context.
 * Use this in Logger methods so every log line is traceable.
 */
export const reqId = () => _reqIdStore.getStore() ?? "none";

// --------------------------------

// Static about info - cached at module load time
const _staticAboutInfo = {
    about: {
        name: "SensorNET Services",
        version: APP_VERSION,
        codename: APP_NAME,
        author: "Randy Dodson (dodsonsoftware@gmail.com)",
        description:
            "**SensorNET Services** is the primary backend API for the **SensorNET** platform. " +
            "Built with Express and TypeScript, it connects MQTT-enabled IoT sensors with web applications, " +
            "monitoring systems, and other HTTP clients.\n" +
            "\n" +
            "**SensorNET Services** provides centralized sensor discovery, real-time telemetry access, " +
            "remote device commands, and configuration management. " +
            "Supported operations include identifying sensors, retrieving device details, " +
            "reading and updating configuration, and remotely restarting devices. " +
            "MQTT command responses are tracked asynchronously with configurable timeouts " +
            "to prevent requests from hanging indefinitely.\n" +
            "\n" +
            "**SensorNET Services** manages application settings with PostgreSQL. " +
            "Exposes Prometheus metrics for tracking API request volume, latency, failures, and overall service health, " +
            "while forwarding structured application logs to Loki for centralized search, filtering, and troubleshooting.\n" +
            "\n" +
            "Production-focused features—including request ID tracing, rate limiting, input validation, " +
            "configuration hot reloading, graceful shutdown, and resilient error handling—help ensure " +
            "reliable operation across the SensorNET environment.",
        copyright: "Copyright © 2026 dodson Software ( dodson labs )",
        license: "MIT"
    },
    commands: []
};

export function aboutDude() {
    return _staticAboutInfo;
}

