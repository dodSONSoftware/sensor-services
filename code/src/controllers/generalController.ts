/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
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
            load_1min: number;
            load_5min: number;
            load_15min: number;
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
            load_1min: loadavg[0],
            load_5min: loadavg[1],
            load_15min: loadavg[2],
        },
    };

    logger()?.write_debug("generalController.ts/getHealth", JSON.stringify(health));

    res.status(OK);
    res.contentType(Json);
    res.send(health);
}

export function getReady(req: express.Request, res: express.Response) {
    const is_connected = (req as express.Request & { mqtt_connected: boolean }).mqtt_connected;
    const prom_ready = (req as express.Request & { prometheus_server_ready: boolean }).prometheus_server_ready;
    const ippinger_reachable = (req as express.Request & { ippinger_reachable: boolean }).ippinger_reachable;

    // MQTT and Prometheus are critical — if either is down, the service is not ready.
    // The IP pinger is non-critical — if only it is down, the service is diminished.
    const critical_ok = is_connected && prom_ready;
    const status = !critical_ok ? "not_ready" : ippinger_reachable ? "ready" : "diminished";

    const body = {
        status,
        dependencies: {
            mqtt: is_connected ? "connected" : "disconnected",
            prometheus_server: prom_ready ? "ready" : "not_ready",
            ippinger: ippinger_reachable ? "ready" : "not_ready",
        },
    };

    logger()?.write_debug("generalController.ts/getReady", JSON.stringify(body));

    res.status(status === "not_ready" ? 503 : OK);
    res.contentType(Json);
    res.send(body);
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
