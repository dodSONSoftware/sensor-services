/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import type * as express from "express";
import { InternalServerError, Json, OK } from "../dodsonlabs/HttpConstants";
import { logger } from "../common/global";
import type { ILogger } from "../dodsonlabs/Interfaces";
import { ensureError } from "../dodsonlabs/SystemFunctions";

// Null-safe logger: falls back to no-op methods when logger() is undefined
const _noopLogger: ILogger = {
    global_log_level: () => 0,
    global_log_level_string: () => "none",
    write_info: () => {},
    write_warn: () => {},
    write_error: () => {},
    write_debug: () => {},
};
const _log = () => logger() ?? _noopLogger;

// Loki configuration from config.yml
interface LokiConfig {
    url: string;
}

// Get Loki config from global config
function getLokiConfig(): LokiConfig | null {
    const config = require("../common/global").getConfig();
    if (!config) {
        _log().write_error("getLokiConfig", "No config found");
        return null;
    }

    // Debug: log the config keys
    _log().write_debug("getLokiConfig", `Config keys: ${Object.keys(config).join(", ")}`);
    _log().write_debug("getLokiConfig", `loki-url value: ${(config as Record<string, unknown>)["loki-url"]}`);
    _log().write_debug("getLokiConfig", `loki-enabled value: ${(config as Record<string, unknown>)["loki-enabled"]}`);

    // Check for loki configuration - support both nested "loki" object and flat "loki-url"
    let url: unknown;

    const lokiConfig = (config as Record<string, unknown>)["loki"];
    if (lokiConfig && typeof lokiConfig === "object") {
        url = (lokiConfig as Record<string, unknown>)["url"];
        _log().write_debug("getLokiConfig", "Found nested loki.url");
    } else {
        // Fall back to flat loki-url setting
        url = (config as Record<string, unknown>)["loki-url"];
        _log().write_debug("getLokiConfig", `Using flat loki-url: ${url}`);
    }

    if (typeof url !== "string" || !url) {
        _log().write_error("getLokiConfig", `URL is not a valid string: ${url}`);
        return null;
    }

    // Check if Loki is enabled (if configured)
    const lokiEnabled = (config as Record<string, unknown>)["loki-enabled"];
    if (lokiEnabled !== undefined && lokiEnabled !== true && lokiEnabled !== "true") {
        _log().write_warn("getLokiConfig", `Loki disabled: loki-enabled=${lokiEnabled}`);
        return null;
    }

    _log().write_info("getLokiConfig", `Loki URL configured: ${url}`);
    return { url };
}

// Loki response types
interface LokiResultRow {
    stream?: Record<string, string>;
    values?: [string, string][];
}

interface LokiResponseData {
    resultType?: string;
    result?: LokiResultRow[];
}

interface LokiResponse {
    data?: LokiResponseData;
}

/**
 * Fetch logs from Loki for a specific sensor source and log levels.
 * @param source The sensor source name (e.g., "Air-Light-1" or "ip-pinger")
 * @param levels Array of log levels to filter (debug, info, warn, error)
 * @param limit Maximum number of log entries to return
 * @param endTime Optional end timestamp in seconds for pagination (loads logs before this time)
 * @returns Array of log entries
 */
async function fetchLokiLogs(source: string, levels: string[], limit: number, endTime?: number): Promise<Array<{ timestamp: string; level: string; message: string }>> {
    const lokiConfig = getLokiConfig();
    if (!lokiConfig) {
        _log().write_error("logController.ts/fetchLokiLogs", "Loki configuration not found");
        throw new Error("Loki logging not configured");
    }

    // Build LogQL query
    // Sensor telemetry uses: {service_name="sensor-telemetry",container="sensor-telemetry"}
    // IP pinger uses: {app="ip-pinger",env="production"}
    // Note: order and limit are passed as query parameters (dir=backward&limit=N), not in the query string
    let query: string;

    if (source === "ip-pinger") {
        // IP pinger may use different labels - try both possible label sets
        // Grafana shows logs with service_name: ip-pinger
        query = `{service_name="ip-pinger"}`;
    } else {
        // Default to sensor-telemetry labels
        query = `{service_name="sensor-telemetry",container="sensor-telemetry"}`;
    }

    // Parse JSON first so we can filter on fields within the JSON
    query += "|json";

    if (source && source !== "ip-pinger") {
        // Only filter on source field for non-ip-pinger sources
        // IP pinger doesn't include a 'source' field in its log messages
        query += `|source="${source}"`;
    }

    if (levels && levels.length > 0) {
        const escapedLevels = levels.map(l => l.toLowerCase()).join("|");
        query += `|level=~"^(${escapedLevels})$"`;
    }

    const defaultEndTime = Math.floor(Date.now() / 1000); // Current time in seconds
    const actualEndTime = endTime ?? defaultEndTime;
    // Use a longer window when paginating to ensure we get more logs
    // When endTime is provided (pagination), use 2 hours to capture more history
    // When fetching fresh logs, use 1 hour to avoid overwhelming the user
    const windowHours = endTime ? 2 : 1;
    const startTime = actualEndTime - (windowHours * 3600);

    // Build URL with query parameters
    // dir=backward for descending order (newest first)
    // limit is passed as a parameter instead of in the query string
    const params = new URLSearchParams({
        query,
        start: String(startTime),
        end: String(actualEndTime),
        dir: "backward",
        limit: String(limit)
    });

    const url = `${lokiConfig.url}/loki/api/v1/query_range?${params.toString()}`;

    _log().write_info("logController.ts/fetchLokiLogs", `Fetching logs for source: ${source}`);
    _log().write_info("logController.ts/fetchLokiLogs", `Loki query: ${query}`);
    _log().write_debug("logController.ts/fetchLokiLogs", `Loki URL: ${url}`);

    try {
        const response = await fetch(url);

        if (!response.ok) {
            const errorText = await response.text();
            _log().write_error("logController.ts/fetchLokiLogs", `Loki API error: ${response.status} ${errorText}`);
            throw new Error(`Loki API error: ${response.status}`);
        }

        const data = await response.json() as LokiResponse;

        // Log result count for debugging
        const results = data.data?.result || [];
        _log().write_info("logController.ts/fetchLokiLogs", `Loki returned ${results.length} result stream(s)`);
        _log().write_debug("logController.ts/fetchLokiLogs", `Loki full response: ${JSON.stringify(data)}`);

        const logs: Array<{ timestamp: string; level: string; message: string }> = [];

        for (const row of results) {
            const values = row.values || [];

            // Log stream labels for debugging
            const streamLabels = row.stream ? JSON.stringify(row.stream) : "no labels";
            _log().write_debug("logController.ts/fetchLokiLogs", `Stream labels: ${streamLabels}`);

            for (const value of values) {
                if (Array.isArray(value) && value.length >= 2) {
                    const timestamp = value[0];
                    const rawMessage = value[1];

                    // Try to parse the JSON message
                    let message = String(rawMessage);
                    let level = "info"; // default

                    try {
                        const parsed = typeof rawMessage === "string" ? JSON.parse(rawMessage) : rawMessage;
                        if (parsed && typeof parsed === "object") {
                            // Extract level from message if present
                            if (parsed.level) {
                                level = String(parsed.level).toLowerCase();
                            }
                            // Extract message field
                            if (parsed.message) {
                                message = String(parsed.message);
                            } else if (parsed.msg) {
                                message = String(parsed.msg);
                            } else if (parsed.log) {
                                message = String(parsed.log);
                            }
                        }
                    } catch {
                        // Message wasn't JSON, use as-is
                    }

                    // Loki returns timestamp as nanoseconds (string), convert to ISO string
                    // Nanoseconds to milliseconds: divide by 1,000,000
                    const nsTimestamp = parseFloat(timestamp);
                    const msTimestamp = nsTimestamp / 1_000_000;
                    const isoTimestamp = new Date(msTimestamp).toISOString();

                    logs.push({ timestamp: isoTimestamp, level, message });
                }
            }
        }

        // Limit results to the requested count
        // Loki's limit parameter limits streams, not individual log entries,
        // so we need to manually slice the results
        if (logs.length > limit) {
            logs.splice(limit);
        }

        _log().write_info("logController.ts/fetchLokiLogs", `Returning ${logs.length} log entry(s) for source: ${source}`);

        return logs;

    } catch (err) {
        const error = ensureError(err);
        _log().write_error("logController.ts/fetchLokiLogs", `Failed to fetch logs: ${error.message}`);
        throw error;
    }
}

/**
 * GET /sensors/logs/:source
 * Fetch logs for a specific sensor source
 */
export async function getLogs(req: express.Request, res: express.Response): Promise<void> {
    const source = req.params.source;

    // Get query parameters
    const levelsParam = req.query.level;
    const limitParam = req.query.limit;
    const endParam = req.query.end;  // For pagination: end timestamp (ISO 8601)

    // Parse levels (can be multiple)
    let levels: string[] = [];
    if (levelsParam) {
        if (Array.isArray(levelsParam)) {
            // Cast to string array since Express parses query params differently
            levels = levelsParam.filter((l): l is string => typeof l === "string");
        } else if (typeof levelsParam === "string") {
            levels = [levelsParam];
        }
    }

    // Default to all levels if none specified
    if (levels.length === 0) {
        levels = ["debug", "info", "warn", "error"];
    }

    // Parse limit (default 50, max 100)
    let limit = 50;
    if (limitParam) {
        const parsed = parseInt(String(limitParam), 10);
        if (!isNaN(parsed) && parsed > 0) {
            limit = Math.min(parsed, 100);
        }
    }

    // Parse end timestamp for pagination (optional)
    let endTime: number | undefined;
    if (endParam) {
        const endStr = String(endParam);
        // Parse ISO 8601 timestamp to milliseconds
        const parsedEnd = Date.parse(endStr);
        if (!isNaN(parsedEnd)) {
            endTime = Math.floor(parsedEnd / 1000);  // Convert to seconds for Loki
        }
    }

    try {
        const logs = await fetchLokiLogs(source, levels, limit, endTime);

        res.status(OK);
        res.contentType(Json);
        res.send(logs);

    } catch (err) {
        const error = ensureError(err);
        res.status(InternalServerError).json({ error: error.message });
    }
}
