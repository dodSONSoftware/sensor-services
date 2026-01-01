/*
 * Copyright (c) 2025 dodson Software ( dodson labs )
 * Author: Randy Dodson <dodsonsoftware@gmail.com>
 * Licensed under the MIT License with Patent Grant and NOTICE preservation.
 * See the LICENSE file for the full terms.
 */

import { IAbout, LogLevel } from "../dodsonlabs/Interfaces";
import { Logger } from "../dodsonlabs/Logger";
import { __routesHelp as generalRoutesHelp } from "../routes/generalRoutes";
import { __routesHelp as sensorRoutesHelp } from "../routes/sensorRoutes";
import { __routesHelp as pingerRoutesHelp } from "../routes/pingerRoutes";

// **** public functions

export let logger: Logger;

export const createLogger = (config: any) => {
    logger = new Logger(config);
};

export function aboutDude(): IAbout {
    const cmds = [];
    cmds.push({ name: "General", "help": generalRoutesHelp });
    cmds.push({ name: "Sensor", "help": sensorRoutesHelp });
    cmds.push({ name: "IP Pinger", "help": pingerRoutesHelp });

    return {
        about: {
            name: "Sensor Web Services",
            version: "2.0.0",
            author: "Randy Dodson (dodsonsoftware@gmail.com)",
            description: "Provides sensor-related web services.",
            copyright: "Copyright (c) 2026 dodson Software ( dodson labs )",
            license: "Licensed under the MIT License with Patent Grant and NOTICE preservation."
        },
        commands: cmds
    };
}

// // TODO: 
// // TODO: obsolete
// // TODO:
// export const aboutInformation: IAbout = {
//     about: {
//         name: "Sensor Web Services",
//         version: "2.0.0",
//         author: "Randy Dodson (dodsonsoftware@gmail.com)",
//         description: "Provides sensor-related web services.",
//         copyright: "Copyright (c) 2025 dodson Software ( dodson labs )",
//         license: "Licensed under the MIT License with Patent Grant and NOTICE preservation."
//     },
//     commands: []
// };
