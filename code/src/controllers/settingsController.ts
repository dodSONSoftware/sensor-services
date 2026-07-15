/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import type express from "express";
import { Json, OK } from "../dodsonlabs/HttpConstants";
import { logger } from "../common/global";
import { getSettings, patchSettings } from "../services/settingsStore";
import { appSettingsUpdateSchema, SETTINGS_SCHEMA } from "../schemas/settings";
import type { ZodIssue } from "zod";

// Use the update schema for validation of partial updates (no defaults applied)
const SETTINGS_UPDATE_SCHEMA = appSettingsUpdateSchema;

/**
 * GET /ui/settings — Return all application settings (merged from DB + defaults).
 */
export async function getAllSettings(_req: express.Request, res: express.Response) {
    const settings = getSettings();

    logger()?.write_debug("settingsController.ts/getAllSettings", JSON.stringify(settings));

    res.status(OK);
    res.contentType(Json);
    res.send(settings);
}

/**
 * GET /settings/defaults — Return current settings plus schema metadata for discovery.
 * The frontend uses this to build forms dynamically: field labels, types, valid ranges/enums, and defaults.
 */
export async function getSettingsDefaults(_req: express.Request, res: express.Response) {
    const settings = getSettings();

    logger()?.write_debug("settingsController.ts/getSettingsDefaults", JSON.stringify({ settings, schema: SETTINGS_SCHEMA }));

    res.status(OK);
    res.contentType(Json);
    res.send({ settings, schema: SETTINGS_SCHEMA });
}

/**
 * GET /ui/settings-schema — Return setting definitions with name, type, default, range, and description.
 * Each setting contains:
 * - name: The setting key
 * - type: Data type (string, number, enum, array)
 * - default: Default value
 * - range: Min/max for numbers, options for enums, null otherwise
 * - description: Human-readable description
 */
export async function getSettingsSchema(_req: express.Request, res: express.Response) {
    const schema = Object.entries(SETTINGS_SCHEMA).map(([key, meta]) => ({
        name: key,
        type: meta.type,
        default: meta.default,
        range: meta.type === "number"
            ? { min: meta.min, max: meta.max, step: meta.step }
            : meta.type === "enum"
              ? { options: meta.options }
              : null,
        description: meta.description,
    }));

    logger()?.write_debug("settingsController.ts/getSettingsSchema", JSON.stringify(schema));

    res.status(OK);
    res.contentType(Json);
    res.send(schema);
}

/**
 * PATCH /ui/settings-update — Partial update of application settings.
 * Only the fields present in the request body are updated; missing keys retain their current values.
 */
export async function updateSettings(req: express.Request, res: express.Response) {
    const updates = req.body;

    // Validate updates against schema
    const parsed = SETTINGS_UPDATE_SCHEMA.safeParse(updates);
    if (!parsed.success) {
        const errors = parsed.error.issues.map((issue: ZodIssue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
        const message = `Invalid settings update: ${errors}`;
        logger()?.write_error("settingsController.ts/updateSettings", message);
        res.status(400);
        res.contentType(Json);
        res.send({ error: message });
        return;
    }

    try {
        const merged = await patchSettings(parsed.data);

        res.status(OK);
        res.contentType(Json);
        res.send(merged);
    } catch (err) {
        const message = `Failed to update settings: ${(err as Error).message}`;
        logger()?.write_error("settingsController.ts/updateSettings", message);
        res.status(500);
        res.contentType(Json);
        res.send({ error: message });
    }
}
