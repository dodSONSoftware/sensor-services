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
        expect(res.text).toContain('"/api/read-running-config"');
        // These two paths were silently dropped from the spec when an unquoted
        // example value contained ": " (YAMLSemanticError in swagger-jsdoc).
        expect(res.text).toContain('"/api/reload-config"');
        expect(res.text).toContain('"/api/write-config"');
        // This one was silently dropped (with a YAMLSyntaxError) when the
        // X-Settings-Persisted header description started with a quoted
        // scalar — pin it so a malformed JSDoc value in settingsRoutes.ts is
        // caught instead of vanishing from the spec.
        expect(res.text).toContain('"/ui/settings-update"');
        // The server URL is populated from the explicit override
        expect(res.text).toContain("http://127.0.0.1:32000/");
        // The dead sensor-source label-sanitization keys were removed from the
        // schema, config.yml, and the docs — the spec must not advertise them.
        expect(res.text).not.toContain("sensor-source-");
    });

    // P3-1: the API discovery docs must match the handlers. The reboot response
    // now documents the real command-result shape (including command_metadata),
    // and the deprecated update-config route documents its actual 501 contract
    // instead of the stale 200 partial-update success.
    it("documents reboot as a command-result array and update-config as 501 (P3-1)", async () => {
        const express = require("express");
        const request = require("supertest");
        const app: express.Application = express();
        const codeRoot = join(__dirname, "..", "..");
        setupSwagger(app, 32000, codeRoot, "http://127.0.0.1:32000/");

        const res = await request(app).get("/swagger/swagger-ui-init.js");
        expect(res.status).toBe(200);
        // reboot response documents command_metadata (the real response shape)
        expect(res.text).toContain("command_metadata");
        // update-config documents its 501 contract, not a partial-update success
        expect(res.text).toContain("has no partial configuration update");
        // the stale 200 "Configuration update result" schema is gone
        expect(res.text).not.toContain("Configuration update result");
    });
});
