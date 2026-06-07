/*
 * Copyright (c) 2025-2026 dodson Software ( dodson labs )
 * Author: Randy Dodson <dodsonsoftware@gmail.com>
 * Licensed under the MIT License with Patent Grant and NOTICE preservation.
 * See the LICENSE file for the full terms.
 */

import { resolve, join } from "path";
import swaggerJsDoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import type { Express } from "express";
import * as ipAddress from "ip";
import { aboutDude } from "./common/global";

const adude = aboutDude();

function buildApisArray(srcDir: string): string[] {
    return [join(srcDir, "src", "routes", "**", "*.ts")];
}

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
                url: "", // Set at startup from config or auto-derived
            },
        ],
    },
    apis: [] as string[], // Set at startup via setupSwagger(srcDir)
};

const swaggerDocs = swaggerJsDoc(swaggerOptions);

export const setupSwagger = (app: Express, port: number, srcDir: string, serverUrl?: string) => {
    swaggerOptions.apis = buildApisArray(srcDir);
    // Use explicit URL if provided, otherwise derive from the running machine
    const server = swaggerOptions.swaggerDefinition.servers?.[0];
    if (server) {
        server.url = serverUrl ?? `http://${ipAddress.address()}:${port}/`;
    }

    app.use("/swagger", swaggerUi.serve, swaggerUi.setup(swaggerDocs));
};
