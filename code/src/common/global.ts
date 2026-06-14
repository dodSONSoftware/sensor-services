/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import os from "os";
import { AsyncLocalStorage } from "async_hooks";
import { createRequire } from "module";
import type { IAbout } from "../dodsonlabs/Interfaces";
import { Logger } from "../dodsonlabs/Logger";
import { __routesHelp as generalRoutesHelp } from "../routes/generalRoutes";
import { __routesHelp as sensorRoutesHelp } from "../routes/sensorRoutes";
import { __routesHelp as pingerRoutesHelp } from "../routes/pingerRoutes";
import type { configSchema } from "../schemas/config";
import type { z } from "zod";

// Load version from package.json at module load time
const pkgRequire = createRequire(__filename);
const { version } = pkgRequire("../../package.json") as { version: string };

// **** public functions

let _logger: Logger | undefined;

export function setLogger(l: Logger) { _logger = l; }
export const logger = () => _logger;

export const createLogger = (config: z.infer<typeof configSchema>) => {
    setLogger(new Logger(config));
};

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

let _aboutDudeInfo: IAbout | null = null;

export function aboutDude(): IAbout {
    if (_aboutDudeInfo === null) {
        const cmds = [];
        cmds.push({ "name": "General", "help": generalRoutesHelp });
        cmds.push({ "name": "Sensors", "help": sensorRoutesHelp });
        cmds.push({ "name": "IP Pinger", "help": pingerRoutesHelp });
        //cmds.push({ "name": "", "help": routeNotFoundRoutesHelp })

        const sys_info: { key: string; value: string }[] = [
            { key: "platform", value: os.platform() },
            { key: "arch", value: os.arch() },
            { key: "hostname", value: os.hostname() },
            { key: "uptime_seconds", value: String(Math.floor(os.uptime())) },
            { key: "total_memory", value: `${Math.round(os.totalmem() / 1024 / 1024 / 1024)} GB` },
            { key: "free_memory", value: `${Math.round(os.freemem() / 1024 / 1024 / 1024)} GB` },
        ];

        _aboutDudeInfo = {
            about: {
                name: "Sensor Web Services",
                version,
                author: "Randy Dodson (dodsonsoftware@gmail.com)",
                description: "Provides sensor-related web services.",
                copyright: "Copyright (c) 2025-2026 dodson Software ( dodson labs )",
                license: "Licensed under the MIT License with Patent Grant and NOTICE preservation."
            },
            system_info: sys_info,
            commands: cmds
        };
    }

    return _aboutDudeInfo;
}
