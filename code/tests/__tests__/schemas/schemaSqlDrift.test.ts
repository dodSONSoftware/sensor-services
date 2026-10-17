/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import * as fs from "fs";
import * as path from "path";
import { DEFAULT_SETTINGS } from "../../../src/schemas/settings";

/**
 * database/schema.sql is the documented reference schema operators can run
 * before first app start (database/README.md). Its seed INSERT must stay
 * identical to the row the app self-seeds via DEFAULT_SETTINGS
 * (settingsStore.runInitQueries) — otherwise a manually initialized
 * database carries display-mapping keys that disagree with the app's own
 * defaults (regression: kebab-case vs snake_case telemetry values).
 */
const schemaSqlPath = path.resolve(__dirname, "../../../../database/schema.sql");

/**
 * Extract the JSONB payload seeded by the app_settings INSERT in schema.sql.
 * The payload is a single-quoted SQL string literal; the settings JSON
 * contains no single quotes, so no SQL unescaping is required.
 */
function extractSeededSettings(sql: string): Record<string, unknown> {
    const match = sql.match(/INSERT INTO app_settings[\s\S]*?VALUES\s*\(1,\s*'(.*?)'\s*::jsonb/s);
    if (match === null) {
        throw new Error("Could not locate the app_settings seed INSERT in schema.sql");
    }
    return JSON.parse(match[1]) as Record<string, unknown>;
}

describe("database/schema.sql seed drift", () => {
    it("should seed settings identical to DEFAULT_SETTINGS (regression: telemetry key casing)", () => {
        const sql = fs.readFileSync(schemaSqlPath, "utf8");
        const seeded = extractSeededSettings(sql);

        expect(seeded).toEqual(structuredClone(DEFAULT_SETTINGS));
    });
});
