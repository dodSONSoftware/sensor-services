/*
 * Author: Randy Dodson ( dodson labs )
 * License: 2025, MIT License (see LICENSE file for details)
 */

import swaggerJsDoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Express } from 'express';
import { aboutInformation } from './common/global';

const swaggerOptions = {
    swaggerDefinition: {
        openapi: '3.0.0',
        info: {
            title: aboutInformation.name,
            version: aboutInformation.version,
            description: aboutInformation.description
        },
        servers: [
            {
                url: 'http://192.168.7.131:32000/', // Change this to your server URL
            },
        ],
    },
    apis: ['./src/routes/**/*.ts'], // Recursively include all .ts files in all subdirectories
};

const swaggerDocs = swaggerJsDoc(swaggerOptions);

export const setupSwagger = (app: Express) => {
    app.use('/swagger', swaggerUi.serve, swaggerUi.setup(swaggerDocs));
};
