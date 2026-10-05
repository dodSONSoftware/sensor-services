/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import fs from "fs";
import path from "path";
import { read_file_yaml, type ReadFileResult } from "../dodsonlabs/SystemFunctions";

/**
 * File name (relative to the base config's directory) that holds the
 * credential/secret overrides. It is gitignored and must never be committed or
 * baked into a Docker image. Keys defined in it override the same keys in the
 * base config.yml, so the base file can stay free of real secrets.
 */
export const CONFIG_SECRETS_FILENAME = "config-secrets.yml";

/**
 * Read the base config at `basePath` and merge in an optional sibling
 * `config-secrets.yml` (which overrides the base). Returns the merged, NOT
 * yet schema-validated config data plus an error.
 *
 * Semantics:
 * - Base file missing/unreadable -> `{ data: null, error }` (the caller must
 *   fail to start / report the reload failure).
 * - `config-secrets.yml` absent -> base is returned unchanged. Validation of
 *   the merged result will fail later if a required secret (e.g. db-password)
 *   is missing, which is the intended "missing required secrets fail
 *   validation" behavior.
 * - `config-secrets.yml` present but unparseable, or not a YAML mapping ->
 *   `{ data: null, error }`. A corrupt secrets file is a hard error, never a
 *   silent fallback to the (secret-less) base.
 *
 * This function only reads and merges; it never touches the filesystem for
 * writes and never mutates either input document.
 */
export function readConfigWithSecrets(
    basePath: string
): ReadFileResult<Record<string, unknown>> {
    const base = read_file_yaml<Record<string, unknown>>(basePath);
    if (base.data === null) {
        return { data: null, error: base.error ?? `could not read '${basePath}'` };
    }

    let merged: Record<string, unknown> = { ...base.data };

    const secretsPath = path.join(path.dirname(basePath), CONFIG_SECRETS_FILENAME);
    // Distinguish "absent" (fine) from "present but unreadable/corrupt" (hard
    // error) — a bad secrets file must never silently fall back to the
    // secret-less base.
    if (fs.existsSync(secretsPath)) {
        const secrets = read_file_yaml<unknown>(secretsPath);
        if (secrets.error !== null) {
            // Present but unreadable or unparseable.
            return { data: null, error: `config secrets '${secretsPath}' is unreadable: ${secrets.error}` };
        }
        const d = secrets.data;
        if (d === null || d === undefined) {
            // Empty file -> treated as absent.
        } else if (typeof d === "object" && !Array.isArray(d)) {
            merged = { ...merged, ...(d as Record<string, unknown>) };
        } else {
            // Present but a scalar or list, not a mapping.
            return { data: null, error: `config secrets '${secretsPath}' must be a YAML mapping` };
        }
    }

    return { data: merged, error: null };
}
