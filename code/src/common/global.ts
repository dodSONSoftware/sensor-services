/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import { AsyncLocalStorage } from "async_hooks";
import { createRequire } from "module";
import { Logger } from "../dodsonlabs/Logger";
import type { configSchema } from "../schemas/config";
import type { z } from "zod";

// Load version from package.json at module load time
const pkgRequire = createRequire(__filename);
const { version } = pkgRequire("../../package.json") as { version: string };

// **** public functions

let _logger: Logger | undefined;
let _config: z.infer<typeof configSchema> | undefined;

export function setLogger(l: Logger) { _logger = l; }
export const logger = () => _logger;

export const createLogger = (config: z.infer<typeof configSchema>) => {
    setLogger(new Logger(config));
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
        version,
        author: "Randy Dodson (dodsonsoftware@gmail.com)",
        description:
            "An Express-based REST API service for IoT sensor monitoring and management. " +
            "This service acts as a bridge between IoT weather sensors (via MQTT protocol) and HTTP clients, " +
            "providing comprehensive sensor control, configuration, and data ingestion capabilities. " +
            "Features include real-time sensor telemetry ingestion through MQTT, PostgreSQL-backed settings " +
            "persistence for persistent configuration, Prometheus metrics endpoints for both API observability " +
            "and sensor gauge monitoring, and interactive Swagger UI for API discovery. The service supports " +
            "dynamic sensor identification, configuration reading/writing, remote reboot operations, and " +
            "integration with external IP pinger services for network device management. Built with TypeScript, " +
            "it features graceful shutdown handling, request ID tracing via AsyncLocalStorage, rate limiting, " +
            "and robust error handling for production-grade deployment.",
        copyright: "Copyright (c) 2026 dodson Software ( dodson labs )",
        license: "MIT"
    },
    commands: []
};

export function aboutDude() {
    return _staticAboutInfo;
}

