/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import { z } from "zod";

/**
 * A single allowed CORS origin: an absolute http(s) URL of the form
 * scheme://host[:port] with no path, query, credentials, or fragment — e.g.
 * "http://10.10.10.7:3000" or "https://example.com". Validated at startup so a
 * malformed entry (typo, trailing path, embedded credentials, non-web scheme)
 * fails fast instead of silently mis-configuring CORS (P3-5).
 */
const corsOriginSchema = z.string().refine((value) => {
    try {
        const u = new URL(value);
        return (
            (u.protocol === "http:" || u.protocol === "https:") &&
            u.hostname !== "" &&
            u.username === "" &&
            u.password === "" &&
            u.pathname === "/" &&
            u.search === "" &&
            u.hash === ""
        );
    } catch {
        return false;
    }
}, "cors-allowed-origins entries must be http(s) origins of the form scheme://host[:port]");

/**
 * Zod schema for config.yml.
 * All required keys must match their expected types.
 * Strict: unknown keys are rejected rather than silently stripped, so a typo
 * (e.g. "forward-sensor-log" instead of "forward-sensor-logs") or a leftover
 * from an older config format fails validation instead of being ignored.
 */
export const configSchema = z.strictObject({
    "log-level": z.enum(["error", "warn", "info", "debug"], {
        error: "log-level must be one of: error, warn, info, debug",
    }),
    "express-port": z.number({
        error: "express-port must be a number",
    }).int("express-port must be an integer")
        .positive("express-port must be greater than 0"),
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
    "sensor-telemetry-api": z.string().optional(),
    "case-sensitive": z.boolean({
        error: "case-sensitive must be a boolean",
    }),
    "swagger-server-url": z.string().optional(),
    "loki-url": z.string().optional(),
    "loki-enabled": z.boolean().optional(),
    "mqtt-topic-log": z.string().optional(),
    "forward-sensor-logs": z.boolean().optional(),
    "forward-sensor-logs-level": z.enum(["error", "warn", "info", "debug"], {
        error: "forward-sensor-logs-level must be one of: error, warn, info, debug",
    }).optional(),
    "express-body-limit": z.string().optional(),
    "cors-allowed-origins": z.array(corsOriginSchema).optional(),
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
    // IP-pinger fetch timeout (Optional-2): renamed fetch-timeout-ms ->
    // ippinger-fetch-timeout-ms because it only bounds the pinger proxy /
    // analyze fetches, not all outbound fetches. The old key stays a
    // deprecated alias so existing deployment configs keep working — see
    // resolveIppingerFetchTimeoutMs() for the precedence rule.
    "ippinger-fetch-timeout-ms": z.number({
        error: "ippinger-fetch-timeout-ms must be a number",
    }).int("ippinger-fetch-timeout-ms must be an integer")
        .positive("ippinger-fetch-timeout-ms must be greater than 0")
        .optional(),
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

/**
 * Resolve the IP-pinger fetch timeout in milliseconds (Optional-2).
 *
 * The key was renamed fetch-timeout-ms -> ippinger-fetch-timeout-ms to match
 * its real scope (only the pinger proxy / analyze fetches). Existing
 * deployment configs still use the old key, so it remains a deprecated
 * alias: if both are present the new key wins, otherwise the old key is
 * used, otherwise the 10-second default.
 */
export function resolveIppingerFetchTimeoutMs(config: z.infer<typeof configSchema>): number {
    return config["ippinger-fetch-timeout-ms"] ?? config["fetch-timeout-ms"] ?? 10_000;
}

// Config keys whose values are secrets — never log these verbatim.
const SENSITIVE_CONFIG_KEYS = ["db-password", "loki-url"] as const;

/**
 * Return a shallow copy of the config with secret values masked.
 * Used before logging configuration so sensitive values are not written to
 * application logs or external logging systems.
 */
export function redactConfig<T extends Record<string, unknown>>(config: T): T {
    const redacted: Record<string, unknown> = { ...config };
    for (const key of SENSITIVE_CONFIG_KEYS) {
        if (key in redacted) {
            redacted[key] = "********";
        }
    }
    return redacted as T;
}
