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
