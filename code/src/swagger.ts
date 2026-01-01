/*
 * Copyright (c) 2025 dodson Software ( dodson labs )
 * Author: Randy Dodson <dodsonsoftware@gmail.com>
 * Licensed under the MIT License with Patent Grant and NOTICE preservation.
 * See the LICENSE file for the full terms.
 */

import swaggerJsDoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import { Express } from "express";
import { aboutDude } from "./common/global";

const adude = aboutDude();

const swaggerOptions = {
    swaggerDefinition: {
        openapi: "3.0.0",
        info: {
            title: adude.about.name,
            version: adude.about.version,
            description: adude.about.description,
        },
        servers: [
            {
                url: "http://192.168.7.131:32000/", // Change this to your server URL
            },
        ],
    },
    apis: ["./src/routes/**/*.ts"], // Recursively include all .ts files in all subdirectories
};

const swaggerDocs = swaggerJsDoc(swaggerOptions);

export const setupSwagger = (app: Express) => {
    app.use("/swagger", swaggerUi.serve, swaggerUi.setup(swaggerDocs));
};
