/*
 * Copyright (c) 2025-2026 dodson Software ( dodson labs )
 * Author: Randy Dodson <dodsonsoftware@gmail.com>
 * Licensed under the MIT License with Patent Grant and NOTICE preservation.
 * See the LICENSE file for the full terms.
 */

import os from "os";
import type { IAbout } from "../dodsonlabs/Interfaces";
import { Logger } from "../dodsonlabs/Logger";
import { __routesHelp as generalRoutesHelp } from "../routes/generalRoutes";
import { __routesHelp as sensorRoutesHelp } from "../routes/sensorRoutes";
import { __routesHelp as pingerRoutesHelp } from "../routes/pingerRoutes";
import type { configSchema } from "../schemas/config";
import type { z } from "zod";
//import { __routesHelp as routeNotFoundRoutesHelp } from "../routes/routeNotFound";

// **** public functions

let _logger: Logger | undefined;

export function setLogger(l: Logger) { _logger = l; }
export const logger = () => _logger;

export const createLogger = (config: z.infer<typeof configSchema>) => {
    setLogger(new Logger(config));
};

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
                version: "2.0.0",
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
