/*
 * Author: Randy Dodson ( dodson labs )
 * License: 2025, MIT License (see LICENSE file for details)
 */

import { IAbout, LogLevel } from "../dodsonlabs/Interfaces";
import { Logger } from "../dodsonlabs/Logger";



// **** public functions

export let logger: Logger;

export const createLogger = (config: any) => {
    logger = new Logger(config);
};

export const aboutInformation: IAbout = {
    name: 'Sensor Web Services',
    version: '2.0.0',
    author: 'dodson labs',
    description: 'Provides sensor-related web services.'
};
