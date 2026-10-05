/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import type * as express from "express";
import { Json, OK, ServiceUnavailable, Text } from "../dodsonlabs/HttpConstants";
import { aboutDude, getConfig, logger } from "../common/global";
import { __routesHelp as generalRoutesHelp } from "../routes/generalRoutes";
import { __routesHelp as sensorRoutesHelp } from "../routes/sensorRoutes";
import { __routesHelp as pingerRoutesHelp } from "../routes/pingerRoutes";
import { __routesHelp as settingsRoutesHelp } from "../routes/settingsRoutes";
import { __routesHelp as configRoutesHelp } from "../routes/configRoutes";
import { __routesHelp as logRoutesHelp } from "../routes/logRoutes";

// **** public functions

const startTime = Date.now();

// Timeout for each dependency probe in the /health check (ms).
//
// This must be materially SHORTER than Docker's healthcheck `--timeout=5s`
// (see code/Dockerfile). The IP-pinger and sensor-telemetry probes run
// concurrently, so the worst-case /health latency is roughly this value plus
// small overhead. Keeping it at 2500ms leaves a comfortable margin so a slow
// or wedged dependency cannot push /health past Docker's 5s deadline and make
// the container appear down when it is actually up-but-degraded. (A probe that
// times out is treated as "unreachable" -> the status is already classified as
// "degraded"/"unhealthy" below; only the deadline here changes.)
const HEALTH_CHECK_TIMEOUT_MS = 2500;

/**
 * Health check response from external services.
 */
interface HealthResponse {
    status: string;
    [key: string]: unknown;
}

/**
 * Check if the IP Pinger service is healthy by fetching its /health endpoint.
 * Returns true if the response contains status: "healthy".
 */
async function checkIpPingerHealth(ipPingerUrl: string): Promise<boolean> {
    try {
        const url = `${ipPingerUrl}/health`;
        const signal = AbortSignal.timeout(HEALTH_CHECK_TIMEOUT_MS);
        const response = await fetch(url, { signal });
        if (!response.ok) {
            return false;
        }
        const data = (await response.json()) as HealthResponse;
        return data.status === "healthy";
    } catch (error) {
        logger()?.write_warn("checkIpPingerHealth", `Failed to reach IP Pinger: ${(error as Error).message}`);
        return false;
    }
}

/**
 * Check if the Sensor Telemetry service is healthy by fetching its /health endpoint.
 * Returns true if the response contains status: "healthy".
 */
async function checkSensorTelemetryHealth(telemetryUrl: string): Promise<boolean> {
    try {
        const url = `${telemetryUrl}/health`;
        const signal = AbortSignal.timeout(HEALTH_CHECK_TIMEOUT_MS);
        const response = await fetch(url, { signal });
        if (!response.ok) {
            return false;
        }
        const data = (await response.json()) as HealthResponse;
        return data.status === "healthy";
    } catch (error) {
        logger()?.write_warn("checkSensorTelemetryHealth", `Failed to reach Sensor Telemetry: ${(error as Error).message}`);
        return false;
    }
}

export async function getAbout(req: express.Request, res: express.Response) {
    const is_connected = (req as express.Request & { mqtt_connected: boolean }).mqtt_connected;
    const config = getConfig();
    const dude = aboutDude();

    // Get URLs from config
    const ipPingerUrl = config ? config["ip-pinger-web-api"] : "";
    const telemetryUrl = config ? config["sensor-telemetry-api"] : "";

    // Perform health checks concurrently
    const [ipPingerHealthy, telemetryHealthy] = await Promise.all([
        ipPingerUrl ? checkIpPingerHealth(ipPingerUrl) : true,
        telemetryUrl ? checkSensorTelemetryHealth(telemetryUrl) : true,
    ]);

    // MQTT is vital - if disconnected, status is unhealthy
    // If MQTT connected but other services down, status is degraded
    // If all services healthy, status is healthy
    let status: "healthy" | "degraded" | "unhealthy";
    if (!is_connected) {
        status = "unhealthy";
    } else if (!ipPingerHealthy || !telemetryHealthy) {
        status = "degraded";
    } else {
        status = "healthy";
    }

    const cmds = [];
    cmds.push({ "name": "General", "help": generalRoutesHelp });
    cmds.push({ "name": "Sensors", "help": sensorRoutesHelp });
    cmds.push({ "name": "Pinger", "help": pingerRoutesHelp });
    cmds.push({ "name": "Settings", "help": settingsRoutesHelp });
    cmds.push({ "name": "Configuration", "help": configRoutesHelp });
    cmds.push({ "name": "Logs", "help": logRoutesHelp });

    const about = {
        about: {
            name: dude.about.name,
            version: dude.about.version,
            author: dude.about.author,
            description: dude.about.description,
            copyright: dude.about.copyright,
            license: dude.about.license
        },
        system: {
            status,
            mqtt: is_connected ? "connected" : "disconnected",
            ipPinger: ipPingerHealthy ? "healthy" : "unreachable",
            sensorTelemetry: telemetryHealthy ? "healthy" : "unreachable",
            bootdate: new Date(startTime).toISOString()
        },
        routes: cmds
    };

    logger()?.write_debug("generalController.ts/getAbout", JSON.stringify(about));

    res.status(OK);
    res.contentType(Json);
    res.send(about);
}

export function getDateCurrent(_req: express.Request, res: express.Response) {
    // get UTC date-time string
    const dt = new Date();
    const t = dt.toTimeString().split(" ")[0];
    const y = dt.getFullYear().toString();
    const m = (dt.getMonth() + 1).toString().padStart(2, "0"); // getMonth() is zero-based
    const d = dt.getDate().toString().padStart(2, "0");
    const final = `${y}-${m}-${d}T${t}`;

    // log it
    logger()?.write_debug("generalController.ts/getDateCurrent", `(${final})`);

    // publish it
    res.status(OK);
    res.contentType(Text);
    res.send(final);
}

export async function getHealth(req: express.Request, res: express.Response) {
    const is_connected = (req as express.Request & { mqtt_connected: boolean }).mqtt_connected;
    const config = getConfig();

    // Get URLs from config
    const ipPingerUrl = config ? config["ip-pinger-web-api"] : "";
    const telemetryUrl = config ? config["sensor-telemetry-api"] : "";

    // Perform health checks concurrently
    const [ipPingerHealthy, telemetryHealthy] = await Promise.all([
        ipPingerUrl ? checkIpPingerHealth(ipPingerUrl) : true,
        telemetryUrl ? checkSensorTelemetryHealth(telemetryUrl) : true,
    ]);

    // MQTT is vital - if disconnected, status is unhealthy
    // If MQTT connected but other services down, status is degraded
    // If all services healthy, status is healthy
    let status: "healthy" | "degraded" | "unhealthy";
    if (!is_connected) {
        status = "unhealthy";
    } else if (!ipPingerHealthy || !telemetryHealthy) {
        status = "degraded";
    } else {
        status = "healthy";
    }

    const health = {
        status,
        mqtt: is_connected ? "connected" : "disconnected",
        ipPinger: ipPingerHealthy ? "healthy" : "unreachable",
        sensorTelemetry: telemetryHealthy ? "healthy" : "unreachable",
        timestamp: new Date().toISOString(),
        uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
    };

    logger()?.write_debug("generalController.ts/getHealth", JSON.stringify(health));

    // HTTP status mirrors the health contract so orchestration (curl -f
    // healthchecks) sees critical failures: 200 for healthy/degraded,
    // 503 for unhealthy.
    const httpStatus = status === "unhealthy" ? ServiceUnavailable : OK;
    res.status(httpStatus);
    res.contentType(Json);
    res.send(health);
}

export function getEndpoints(_req: express.Request, res: express.Response) {
    const endpoints = [
        {
            name: "About",
            route: "/about",
            verb: "GET",
            requestBody: "None",
            responseBody: "{ about: {...}, system: { status: \"healthy|degraded|unhealthy\", mqtt: \"connected|disconnected\", ipPinger: \"healthy|unreachable\", sensorTelemetry: \"healthy|unreachable\", bootdate: string }, routes: [...] }",
            description: "Returns service information including system health status for MQTT, IP Pinger, and Sensor Telemetry."
        },
        {
            name: "Endpoints",
            route: "/endpoints",
            verb: "GET",
            requestBody: "None",
            responseBody: "Object containing an array of endpoint details",
            description: "Returns detailed information about each API endpoint."
        },
        {
            name: "Health",
            route: "/health",
            verb: "GET",
            requestBody: "None",
            responseBody: "{ status: \"healthy|degraded|unhealthy\", mqtt: \"connected|disconnected\", ipPinger: \"healthy|unreachable\", sensorTelemetry: \"healthy|unreachable\", timestamp: \"ISO-date-string\" }",
            description: "Health check endpoint for container orchestration. HTTP 200 for healthy/degraded, HTTP 503 for unhealthy. Status is 'degraded' if a non-critical component is down and 'unhealthy' if MQTT is disconnected."
        },
        {
            "name": "Date Local (legacy)",
            "route": "/date_local",
            "verb": "GET",
            "requestBody": "None",
            "responseBody": "Current local date/time string (yyyy-mm-ddThh:mm:ss)",
            "description": "Returns the current local date and time of the server's timezone."
        },
        {
            "name": "Date UTC (legacy)",
            "route": "/date_utc",
            "verb": "GET",
            "requestBody": "None",
            "responseBody": "Current UTC date/time string (yyyy-mm-ddThh:mm:ssZ)",
            "description": "Returns the current date and time in Coordinated Universal Time (UTC)."
        },
        {
            "name": "Date Local",
            "route": "/date-local",
            "verb": "GET",
            "requestBody": "None",
            "responseBody": "Current local date/time string (yyyy-mm-ddThh:mm:ss)",
            "description": "Alias for /date_local with dash notation."
        },
        {
            "name": "Date UTC",
            "route": "/date-utc",
            "verb": "GET",
            "requestBody": "None",
            "responseBody": "Current UTC date/time string (yyyy-mm-ddThh:mm:ssZ)",
            "description": "Alias for /date_utc with dash notation."
        },
        {
            name: "Metrics",
            route: "/metrics",
            verb: "GET",
            requestBody: "None",
            responseBody: "Prometheus metrics in text format",
            description: "Returns Prometheus metrics for API-specific HTTP requests, duration, and errors."
        },
        {
            name: "Settings Get",
            route: "/ui/settings",
            verb: "GET",
            requestBody: "None",
            responseBody: "All application settings merged from database and defaults",
            description: "Retrieves all application settings."
        },
        {
            name: "Settings Schema",
            route: "/ui/settings-schema",
            verb: "GET",
            requestBody: "None",
            responseBody: "Array of setting definitions with name, default, range, and description",
            description: "Returns setting definitions for dynamic form generation."
        },
        {
            name: "Settings Update",
            route: "/ui/settings-update",
            verb: "PATCH",
            requestBody: "Partial JSON object with settings fields to update",
            responseBody: "Merged settings object with updates applied",
            description: "Partially updates settings in the database."
        },
        {
            name: "Sensor Get Details",
            route: "/sensors/get-details",
            verb: "GET",
            requestBody: "None",
            responseBody: "Array of sensor detail responses",
            description: "Gets details for all sensors."
        },
        {
            name: "Sensor Get Details Single",
            route: "/sensors/get-details/:source",
            verb: "GET",
            requestBody: "None",
            responseBody: "Sensor detail response for specified source",
            description: "Gets details for a specific sensor by source ID."
        },
        {
            name: "Sensor Reboot All",
            route: "/sensors/reboot",
            verb: "POST",
            requestBody: "None",
            responseBody: "{ success: boolean, message: string }",
            description: "Reboots all sensors."
        },
        {
            name: "Sensor Reboot Single",
            route: "/sensors/reboot/:source",
            verb: "POST",
            requestBody: "None",
            responseBody: "{ success: boolean, message: string }",
            description: "Reboots a specific sensor by source ID."
        },
        {
            name: "Sensor Read Config",
            route: "/sensors/read-config",
            verb: "GET",
            requestBody: "None",
            responseBody: "Array of sensor configuration responses",
            description: "Reads configuration from all sensors."
        },
        {
            name: "Sensor Read Config Single",
            route: "/sensors/read-config/:source",
            verb: "GET",
            requestBody: "None",
            responseBody: "Sensor configuration response for specified source",
            description: "Reads configuration from a specific sensor by source ID."
        },
        {
            name: "Sensor Write Config",
            route: "/sensors/write-config/:source",
            verb: "POST",
            requestBody: "JSON object with sensor configuration values",
            responseBody: "{ success: boolean, message: string }",
            description: "Writes configuration to a specific sensor."
        },
        {
            name: "Sensor Update Config",
            route: "/sensors/update-config/:source",
            verb: "POST",
            requestBody: "JSON object with partial sensor configuration values",
            responseBody: "{ success: boolean, message: string }",
            description: "Updates configuration on a specific sensor."
        },
        {
            name: "Sensor Logs",
            route: "/sensors/logs/:source",
            verb: "GET",
            requestBody: "None",
            responseBody: "Array of log entries with timestamp, level, and message",
            description: "Retrieves logs for a specific sensor from Grafana Loki."
        },
        {
            name: "IP Pinger Analyze",
            route: "/sensors/ippinger-analyze",
            verb: "GET",
            requestBody: "None",
            responseBody: "Analysis results comparing pinger config vs live sensors",
            description: "Compares IP pinger configuration against live sensor discovery."
        },
        {
            name: "Reload Config",
            route: "/api/reload-config",
            verb: "GET",
            requestBody: "None",
            responseBody: "{ success: boolean, message: string }",
            description: "Hot-reloads the application configuration from disk."
        },
        {
            name: "Read Config",
            route: "/api/read-config",
            verb: "GET",
            requestBody: "None",
            responseBody: "Current application configuration as JSON",
            description: "Returns the current application configuration."
        },
        {
            name: "Write Config",
            route: "/api/write-config",
            verb: "POST",
            requestBody: "Complete valid configuration JSON object",
            responseBody: "{ success: boolean, message: string }",
            description: "Saves a new configuration to disk and hot-reloads the application."
        }
    ];

    const response = { endpoints };

    logger()?.write_debug("generalController.ts/getEndpoints", JSON.stringify(response));

    res.status(OK);
    res.contentType(Json);
    res.send(response);
}

export function getDateUTC(_req: express.Request, res: express.Response) {
    // get UTC date-time string
    const dt = `${new Date().toISOString().split(".")[0]}Z`;

    // log it
    logger()?.write_debug("generalController.ts/getDateUTC", `(${dt})`);

    // publish it
    res.status(OK);
    res.contentType(Text);
    res.send(dt);
}
