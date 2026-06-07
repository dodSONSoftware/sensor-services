/*
 * Copyright (c) 2025-2026 dodson Software ( dodson labs )
 * Author: Randy Dodson <dodsonsoftware@gmail.com>
 * Licensed under the MIT License with Patent Grant and NOTICE preservation.
 * See the LICENSE file for the full terms.
 */

import type * as express from "express";
import { Json, OK, Text } from "../dodsonlabs/HttpConstants";
import { aboutDude, logger } from "../common/global";
import os from "os";

// **** public functions

export function getAbout(_req: express.Request, res: express.Response) {
    const dude = aboutDude();

    // log it
    logger()?.write_debug("generalController.ts/getAbout", JSON.stringify(dude));

    // publish it
    res.status(OK);
    res.contentType(Json);
    res.send(dude);
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
    const dude = aboutDude();
    const is_connected = (req as express.Request & { mqtt_connected: boolean }).mqtt_connected;
    const prom_ready = (req as express.Request & { prometheus_server_ready: boolean }).prometheus_server_ready;

    const mem = process.memoryUsage();
    const loadavg = os.loadavg();

    const health: {
        status: "ok" | "degraded";
        service: string;
        version: string;
        mqtt: "connected" | "disconnected";
        prometheus_server: "ready" | "not_ready";
        uptime_seconds: number;
        timestamp: string;
        memory: {
            rss: number;
            heap_used: number;
            heap_total: number;
        };
        cpu: {
            load: number;
        };
    } = {
        status: is_connected && prom_ready ? "ok" : "degraded",
        service: dude.about.name,
        version: dude.about.version,
        mqtt: is_connected ? "connected" : "disconnected",
        prometheus_server: prom_ready ? "ready" : "not_ready",
        uptime_seconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
        memory: {
            rss: mem.rss,
            heap_used: mem.heapUsed,
            heap_total: mem.heapTotal,
        },
        cpu: {
            load: loadavg[0],
        },
    };

    logger()?.write_debug("generalController.ts/getHealth", JSON.stringify(health));

    res.status(OK);
    res.contentType(Json);
    res.send(health);
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
