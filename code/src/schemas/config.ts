/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import { z } from "zod";

/**
 * Zod schema for config.yml.
 * All keys are required and must match their expected types.
 * Optional keys (swagger-server-url) are added via .partial() at the call site.
 */
export const configSchema = z.object({
    "log-level": z.enum(["error", "warn", "info", "debug"], {
        error: "log-level must be one of: error, warn, info, debug",
    }),
    "express-port": z.number({
        error: "express-port must be a number",
    }).int("express-port must be an integer")
        .positive("express-port must be greater than 0"),
    "prometheus-port": z.number({
        error: "prometheus-port must be a number",
    }).int("prometheus-port must be an integer")
        .positive("prometheus-port must be greater than 0"),
    "mqtt-broker-ip-address": z.string({
        error: "mqtt-broker-ip-address must be a string",
    }).min(1, "mqtt-broker-ip-address must not be empty"),
    "mqtt-topic-telemetry": z.string({
        error: "mqtt-topic-telemetry must be a string",
    }).min(1, "mqtt-topic-telemetry must not be empty"),
    "mqtt-topic-command": z.string({
        error: "mqtt-topic-command must be a string",
    }).min(1, "mqtt-topic-command must not be empty"),
    "mqtt-topic-command-response": z.string({
        error: "mqtt-topic-command-response must be a string",
    }).min(1, "mqtt-topic-command-response must not be empty"),
    "ip-pinger-web-api": z.string({
        error: "ip-pinger-web-api must be a string",
    }).min(1, "ip-pinger-web-api must not be empty"),
    "case-sensitive": z.boolean({
        error: "case-sensitive must be a boolean",
    }),
    "swagger-server-url": z.string().optional(),
    "loki-url": z.string().optional(),
    "loki-enabled": z.boolean().optional(),
    "forward-sensor-logs": z.boolean().optional(),
    "forward-sensor-logs-level": z.enum(["error", "warn", "info", "debug"], {
        error: "forward-sensor-logs-level must be one of: error, warn, info, debug",
    }).optional(),
    "express-body-limit": z.string().optional(),
    "rate-limit-window-ms": z.number({
        error: "rate-limit-window-ms must be a number",
    }).int("rate-limit-window-ms must be an integer")
        .positive("rate-limit-window-ms must be greater than 0").optional(),
    "rate-limit-max": z.number({
        error: "rate-limit-max must be a number",
    }).int("rate-limit-max must be an integer")
        .positive("rate-limit-max must be greater than 0").optional(),
    "sensor-source-max-length": z.number({
        error: "sensor-source-max-length must be a number",
    }).int("sensor-source-max-length must be an integer")
        .positive("sensor-source-max-length must be greater than 0")
        .optional(),
    "sensor-source-valid-chars-regex": z.string().optional(),
    "fetch-timeout-ms": z.number({
        error: "fetch-timeout-ms must be a number",
    }).int("fetch-timeout-ms must be an integer")
        .positive("fetch-timeout-ms must be greater than 0")
        .optional(),
    "command-silence-timeout-ms": z.number({
        error: "command-silence-timeout-ms must be a number",
    }).int("command-silence-timeout-ms must be an integer")
        .positive("command-silence-timeout-ms must be greater than 0")
        .optional(),
    "db-host": z.string({
        error: "db-host must be a string",
    }).min(1, "db-host must not be empty"),
    "db-port": z.number({
        error: "db-port must be a number",
    }).int("db-port must be an integer")
        .positive("db-port must be greater than 0")
        .lte(65535, "db-port must be a valid TCP port (1-65535)"),
    "db-name": z.string({
        error: "db-name must be a string",
    }).min(1, "db-name must not be empty"),
    "db-user": z.string({
        error: "db-user must be a string",
    }).min(1, "db-user must not be empty"),
    "db-password": z.string({
        error: "db-password must be a string",
    }).min(1, "db-password must not be empty"),
});

/**
 * Validates a parsed YAML/JSON config object against the config schema.
 * Returns the typed config on success, or throws on failure.
 */
export function validateConfig(raw: unknown): z.infer<typeof configSchema> {
    const result = configSchema.safeParse(raw);
    if (!result.success) {
        const messages = result.error.issues.map(i => i.message).join("; ");
        throw new Error(`Config validation failed: ${messages}`);
    }
    return result.data;
}
