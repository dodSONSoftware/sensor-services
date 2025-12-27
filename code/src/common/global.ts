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
    name: "Sensor Web Services",
    version: "2.0.0",
    author: "Randy Dodson (dodsonsoftware@gmail.com)",
    description: "Provides sensor-related web services.",
    copyright: "Copyright (c) 2025 dodson Software ( dodson labs )",
    license: "Licensed under the MIT License with Patent Grant and NOTICE preservation."
};
