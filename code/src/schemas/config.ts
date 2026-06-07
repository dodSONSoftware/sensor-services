/*
 * Copyright (c) 2025-2026 dodson Software ( dodson labs )
 * Author: Randy Dodson <dodsonsoftware@gmail.com>
 * Licensed under the MIT License with Patent Grant and NOTICE preservation.
 * See the LICENSE file for the full terms.
 */

import { z } from "zod";

/**
 * Zod schema for config.yml.
 * All keys are required and must match their expected types.
 * Optional keys (swagger-server-url) are added via .partial() at the call site.
 */
export const configSchema = z.object({
    "log-level": z.enum(["error", "info", "debug"], {
        error: "log-level must be one of: error, info, debug",
    }),
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
