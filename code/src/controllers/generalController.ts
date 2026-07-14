/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import type * as express from "express";
import { Json, OK, Text } from "../dodsonlabs/HttpConstants";
import { aboutDude, logger } from "../common/global";
import { __routesHelp as generalRoutesHelp } from "../routes/generalRoutes";
import { __routesHelp as sensorRoutesHelp } from "../routes/sensorRoutes";
import { __routesHelp as pingerRoutesHelp } from "../routes/pingerRoutes";
import { __routesHelp as settingsRoutesHelp } from "../routes/settingsRoutes";

// **** public functions

const startTime = Date.now();

export function getAbout(req: express.Request, res: express.Response) {
    const is_connected = (req as express.Request & { mqtt_connected: boolean }).mqtt_connected;
    const dude = aboutDude();

    const cmds = [];
    cmds.push({ "name": "General", "help": generalRoutesHelp });
    cmds.push({ "name": "Sensors", "help": sensorRoutesHelp });
    cmds.push({ "name": "IP Pinger", "help": pingerRoutesHelp });
    cmds.push({ "name": "Settings", "help": settingsRoutesHelp });

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
            status: is_connected ? "healthy" : "unhealthy",
            mqtt: is_connected ? "connected" : "disconnected",
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
    const m = dt.getMonth().toString().padStart(2, "0");
    const d = dt.getDate().toString().padStart(2, "0");
    const final = `${y}-${m}-${d}T${t}`;

    // log it
    logger()?.write_debug("generalController.ts/getDateCurrent", `(${final})`);

    // publish it
    res.status(OK);
    res.contentType(Text);
    res.send(final);
}

export function getHealth(req: express.Request, res: express.Response) {
    const is_connected = (req as express.Request & { mqtt_connected: boolean }).mqtt_connected;

    const health = {
        status: is_connected ? "healthy" : "unhealthy",
        mqtt: is_connected ? "connected" : "disconnected",
        timestamp: new Date().toISOString(),
    };

    logger()?.write_debug("generalController.ts/getHealth", JSON.stringify(health));

    res.status(OK);
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
            responseBody: "Service information including about, system, and commands sections",
            description: "Returns service information and available API commands."
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
            responseBody: "{ status: \"healthy\", mqtt: \"connected|disconnected\", timestamp: \"ISO-date-string\" }",
            description: "Health check endpoint for container orchestration."
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
            route: "/settings",
            verb: "GET",
            requestBody: "None",
            responseBody: "All application settings merged from database and defaults",
            description: "Retrieves all application settings."
        },
        {
            name: "Settings Defaults",
            route: "/settings/defaults",
            verb: "GET",
            requestBody: "None",
            responseBody: "Current settings plus schema metadata for dynamic form generation",
            description: "Returns settings with schema metadata for dynamic forms."
        },
        {
            name: "Settings Update",
            route: "/settings/update",
            verb: "PATCH",
            requestBody: "Partial JSON object with settings fields to update",
            responseBody: "Merged settings object with updates applied",
            description: "Partially updates settings in the database."
        },
        {
            name: "Sensor Identify All",
            route: "/sensors/identify",
            verb: "GET",
            requestBody: "None",
            responseBody: "Array of sensor identification responses",
            description: "Identifies all sensors on the network."
        },
        {
            name: "Sensor Identify Single",
            route: "/sensors/identify/:source",
            verb: "GET",
            requestBody: "None",
            responseBody: "Sensor identification response for specified source",
            description: "Identifies a specific sensor by source ID."
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
            name: "IP Pinger Analyze",
            route: "/sensors/ippinger-analyze",
            verb: "GET",
            requestBody: "None",
            responseBody: "Analysis results comparing pinger config vs live sensors",
            description: "Compares IP pinger configuration against live sensor discovery."
        },
        {
            name: "IP Pinger About",
            route: "/ippinger/about",
            verb: "GET",
            requestBody: "None",
            responseBody: "IP pinger service information",
            description: "Proxy to IP pinger service /about endpoint."
        },
        {
            name: "IP Pinger Read Config",
            route: "/ippinger/read-config",
            verb: "GET",
            requestBody: "None",
            responseBody: "IP pinger configuration",
            description: "Proxy to IP pinger service /read-config endpoint."
        },
        {
            name: "IP Pinger Write Config",
            route: "/ippinger/write-config",
            verb: "POST",
            requestBody: "JSON object with IP pinger configuration",
            responseBody: "{ success: boolean, message: string }",
            description: "Proxy to IP pinger service /write-config endpoint."
        },
        {
            name: "IP Pinger Restart",
            route: "/ippinger/restart",
            verb: "POST",
            requestBody: "None",
            responseBody: "{ success: boolean, message: string }",
            description: "Proxy to IP pinger service /restart endpoint."
        },
        {
            name: "IP Pinger Ping All",
            route: "/ippinger/ping",
            verb: "GET",
            requestBody: "None",
            responseBody: "Array of ping results for all configured devices",
            description: "Proxy to IP pinger service /ping endpoint."
        },
        {
            name: "IP Pinger Ping Target",
            route: "/ippinger/ping/:target",
            verb: "GET",
            requestBody: "None",
            responseBody: "Ping result for the specified IP address",
            description: "Proxy to IP pinger service /ping/{ip} endpoint."
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
