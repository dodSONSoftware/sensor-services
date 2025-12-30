/*
 * Copyright (c) 2025 dodson Software ( dodson labs )
 * Author: Randy Dodson <dodsonsoftware@gmail.com>
 * Licensed under the MIT License with Patent Grant and NOTICE preservation.
 * See the LICENSE file for the full terms.
 */

import { IAbout, LogLevel } from "../dodsonlabs/Interfaces";
import { Logger } from "../dodsonlabs/Logger";

// **** public functions

export let logger: Logger;

export const createLogger = (config: any) => {
    logger = new Logger(config);
};

export const aboutInformation: IAbout = {
    about: {
        name: "Sensor Web Services",
        version: "2.0.0",
        author: "Randy Dodson (dodsonsoftware@gmail.com)",
        description: "Provides sensor-related web services.",
        copyright: "Copyright (c) 2025 dodson Software ( dodson labs )",
        license: "Licensed under the MIT License with Patent Grant and NOTICE preservation."
    },
    commands: [
        {
            "command": "/ABOUT",
            "description": "Identification and usage information about this api.",
            "help": [
                {
                    "usage": "/about",
                    "description": "Gets this information."
                }
            ]
        },
        {
            "command": "/DATE_LOCAL",
            "description": "The current local date and time.",
            "help": [
                {
                    "usage": "/date_local",
                    "description": "Gets the local datetime. Format--> [yyyy-mm-ddThh:mm:ss]"
                }
            ]
        },
        {
            "command": "/DATE_UTC",
            "description": "The current Coordinated Universal Time (UTC) date and time.",
            "help": [
                {
                    "usage": "/date_utc",
                    "description": "Gets the utc datetime. Format--> [yyyy-mm-ddThh:mm:ss]"
                }
            ]
        },
        {
            "command": "/SENSORS/IDENTIFY",
            "description": "Commands sensors to reply with identification information.",
            "help": [
                {
                    "usage": "/sensors/identify",
                    "description": "Gets sensor identification information for all sensors."
                },
                {
                    "usage": "/sensors/identify/{source}",
                    "description": "Gets sensor identification information for the {source} sensor."
                }
            ]
        }
    ]
};
