/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import { join } from "path";
import type express from "express";
import { setupSwagger } from "../../src/swagger";

// Regression: swaggerJsDoc() used to run at module load with apis: [], so the
// served UI contained an empty spec. The scan must happen inside setupSwagger,
// after the route glob is populated.
describe("setupSwagger", () => {
    it("should serve a spec that contains the real route paths", async () => {
        const express = require("express");
        const request = require("supertest");
        const app: express.Application = express();

        // code/ directory — the glob scans src/routes/**/*.ts, which exists
        // without a build step
        const codeRoot = join(__dirname, "..", "..");
        setupSwagger(app, 32000, codeRoot, "http://127.0.0.1:32000/");

        const res = await request(app).get("/swagger/swagger-ui-init.js");
        expect(res.status).toBe(200);

        // A meaningful subset of the registered routes must be present
        expect(res.text).toContain('"/about"');
        expect(res.text).toContain('"/sensors/get-details"');
        expect(res.text).toContain('"/api/read-config"');
        // These two paths were silently dropped from the spec when an unquoted
        // example value contained ": " (YAMLSemanticError in swagger-jsdoc).
        expect(res.text).toContain('"/api/reload-config"');
        expect(res.text).toContain('"/api/write-config"');
        // The server URL is populated from the explicit override
        expect(res.text).toContain("http://127.0.0.1:32000/");
    });
});
