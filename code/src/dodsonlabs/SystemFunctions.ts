/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import fs from "fs";
import { randomUUID } from "crypto";
import { ILogger, LogLevel } from "./Interfaces";

// **** error functions

export function ensureError(value: unknown): Error {
    // check for undefined
    if (value === undefined) return Error("<<< Error is undefined >>>");

    // check for error
    if (value instanceof Error) return value;

    // convert to json string
    let result =
        "Unknown Error: error value cannot be converted to a json string.";
    try {
        result = JSON.stringify(value);
    } catch { }

    // return new error
    return new Error(result);
}

// **** secret redaction

// Config field names whose values are credentials/secrets and must never reach
// logs, Loki, or API clients. Matched as exact key names, case-insensitively,
// at any nesting depth.
export const SENSITIVE_SECRET_KEYS: ReadonlySet<string> = new Set([
    "wifi-password",
    "password",
    "db-password",
]);

// Single mask literal for all secret redaction in this service. redactConfig()
// in schemas/config.ts and redactLogMessage() below both use it, so every
// masking surface renders the same value.
export const SECRET_MASK = "********";

/**
 * Deep-clone a value, replacing the value of any sensitive key (at any depth,
 * in both objects and arrays) with a mask.
 *
 * Returns a NEW structure — the input is never mutated — so callers can log the
 * redacted copy while publishing/sending the original untouched. Non-secret
 * values pass through unchanged (still deep-cloned for isolation).
 */
export function redactSecrets<T>(value: T, sensitiveKeys: ReadonlySet<string> = SENSITIVE_SECRET_KEYS): T {
    return redactSecretsInternal(value, sensitiveKeys) as T;
}

function redactSecretsInternal(value: unknown, sensitiveKeys: ReadonlySet<string>): unknown {
    if (value === null || typeof value !== "object") {
        return value;
    }
    if (Array.isArray(value)) {
        return value.map((item) => redactSecretsInternal(item, sensitiveKeys));
    }
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
        if (sensitiveKeys.has(key.toLowerCase())) {
            result[key] = SECRET_MASK;
        } else {
            result[key] = redactSecretsInternal(val, sensitiveKeys);
        }
    }
    return result;
}

// Minimum length for a secret value to be masked by the value tier of
// redactLogMessage. A shorter value would mask common substrings of
// unrelated content; values that short are still masked by the key tier
// whenever they appear in key-value form, which is the shape secrets take
// in this service's logs.
export const MIN_SECRET_VALUE_LENGTH = 8;

/**
 * KEY tier of central log redaction — the pattern itself is a fixed source
 * constant; no untrusted data ever enters a pattern.
 *
 * Masks the VALUE of a sensitive key (never the key itself) in JSON-like
 * serialized text. Recognized keys: wifi-password, db-password, loki-url,
 * password (longest alternatives first; the lookbehind prevents the bare
 * "password" alternative from matching inside the hyphenated keys and from
 * matching longer keys such as "xpassword").
 *
 * Value shapes handled: JSON double-quoted ("..."), single-quoted ('...'),
 * and bare `key: value` / `key=value` (bare values terminate at whitespace,
 * comma, semicolon, pipe, `}`, or a quote). Keys may be quoted or bare and
 * match case-insensitively; whitespace around the separator is preserved.
 *
 * Linear-time by construction — safe to run over untrusted forwarded sensor
 * log content on every line: fixed-length one-character lookbehind, no
 * nested quantifiers, the value alternatives are mutually exclusive on their
 * first character, and no alternative can match the empty string (key,
 * separator, and value are each at least one character).
 *
 * MUST stay in sync with SENSITIVE_SECRET_KEYS plus "loki-url"; the unit
 * test "masks every SENSITIVE_SECRET_KEYS entry plus loki-url" fails on drift.
 */
const SENSITIVE_KEY_VALUE_RE =
    /(?<![\w-])(["']?)(wifi-password|db-password|loki-url|password)\1?(\s*)([:=])(\s*)("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^\s,;|}&]+)/gi;

/**
 * Central two-tier redaction for message strings passed to Logger.write_*.
 *
 * 1. KEY tier: one linear pass masking recognized sensitive key values
 *    (catches secrets whose values this service does not know — e.g. sensor
 *    payloads). Preserves the key, its quoting, and surrounding whitespace;
 *    replaces only the value with SECRET_MASK. Prose that mentions a key
 *    without a `:`/`=` value (e.g. `config key "password" missing`) is
 *    untouched.
 * 2. VALUE tier: literal (split/join, never RegExp — values may contain
 *    regex metacharacters) masking of known secret values, applied
 *    longest-first so a secret that is a substring of a longer secret
 *    (a credential embedded in a URL) cannot partially mangle the longer
 *    one. Values shorter than MIN_SECRET_VALUE_LENGTH are skipped.
 *
 * Pure: returns a new string, never mutates its input; idempotent.
 */
export function redactLogMessage(message: string, secretValues: readonly string[] = []): string {
    if (!message) {
        return message;
    }

    // 1. KEY tier — groups: 1=quote 2=key 3=ws 4=separator 5=ws 6=value
    let redacted = message.replace(SENSITIVE_KEY_VALUE_RE,
        (_m, quote: string, key: string, ws1: string, sep: string, ws2: string) =>
            `${quote}${key}${quote}${ws1}${sep}${ws2}${SECRET_MASK}`);

    // 2. VALUE tier — literal substring masking of known secret values.
    const sorted = [...secretValues]
        .filter((v): v is string => typeof v === "string" && v.length >= MIN_SECRET_VALUE_LENGTH)
        .sort((a, b) => b.length - a.length);
    for (const value of sorted) {
        if (redacted.includes(value)) {
            redacted = redacted.split(value).join(SECRET_MASK);
        }
    }
    return redacted;
}

// **** file functions

/** Result of a file read operation — distinguishes "not found" from parse errors. */
export interface ReadFileResult<T> {
    data: T | null;
    error: string | null;
}

export function write_file(
    filename: string,
    content: string,
    logger?: ILogger
): boolean {
    try {
        fs.writeFileSync(filename, content);
        return true;
    } catch (error) {
        const msg = `write_file: failed to write '${filename}': ${(error as Error).message}`;
        if (logger) {
            logger.write_error("SystemFunctions.write_file", msg);
        } else {
            console.error(msg);
        }
        return false;
    }
}

/**
 * Atomically replace a file: write the complete content to a temporary file
 * in the SAME DIRECTORY as the live file, then rename it over the live file.
 * A same-filesystem POSIX rename is atomic, so a crash mid-write can never
 * leave the live file truncated or partially written.
 *
 * When the live file already exists, its permission mode is preserved: the
 * replacement inode is created owner-only and chmod'd to the existing mode
 * before the rename, so an operator's `chmod 600` on a credentials-bearing
 * config survives an atomic write. Ownership follows the service process —
 * a deliberately root- or operator-owned config is a deployment concern,
 * not something this helper should silently chown.
 *
 * On any failure the temporary file is removed (best effort) and the live
 * file is left untouched; returns false so the caller can report the error.
 */
export function write_file_atomic(
    filename: string,
    content: string,
    logger?: ILogger
): boolean {
    // Unique temp name in the same directory — concurrent writers can never
    // clobber each other's temporary files, and rename stays same-filesystem
    const tempPath = `${filename}.${randomUUID()}.tmp`;
    try {
        // The temp file is a NEW inode: with the default creation mode it
        // would get the process's umask-based permissions (e.g. 0644) and
        // the rename would silently change the mode the operator set on the
        // live file. A missing live file means first-time creation, which
        // keeps the default creation mode.
        let existingMode: number | undefined;
        try {
            existingMode = fs.statSync(filename).mode & 0o777;
        } catch {
            // no live file yet
        }
        if (existingMode !== undefined) {
            // Create owner-only so the temp file is never more permissive
            // than the live file while it exists on disk, then chmod to the
            // exact live mode — an open() mode is masked by the process
            // umask, but a chmod is not.
            fs.writeFileSync(tempPath, content, { mode: 0o600 });
            fs.chmodSync(tempPath, existingMode);
        } else {
            fs.writeFileSync(tempPath, content);
        }
        fs.renameSync(tempPath, filename);
        return true;
    } catch (error) {
        // Best-effort temp cleanup; a missing temp file has nothing to clean
        try {
            fs.unlinkSync(tempPath);
        } catch {
            // ignore — temp file may never have been created
        }
        const msg = `write_file_atomic: failed to atomically replace '${filename}': ${(error as Error).message}`;
        if (logger) {
            logger.write_error("SystemFunctions.write_file_atomic", msg);
        } else {
            console.error(msg);
        }
        return false;
    }
}

export function read_file(
    filename: string,
    logger?: ILogger
): string | null {
    try {
        const buffer = fs.readFileSync(filename, "utf8");
        return buffer.toString();
    } catch (error) {
        const msg = `read_file: failed to read '${filename}': ${(error as Error).message}`;
        if (logger) {
            logger.write_error("SystemFunctions.read_file", msg);
        } else {
            console.error(msg);
        }
        return null;
    }
}

export function read_file_json<T>(
    filename: string,
    logger?: ILogger
): ReadFileResult<T> {
    const data = read_file(filename, logger);
    if (data == null) {
        return { data: null, error: `read_file_json: could not read '${filename}'` };
    }
    try {
        return { data: JSON.parse(data), error: null };
    } catch (error) {
        const msg = `read_file_json: failed to parse '${filename}': ${(error as Error).message}`;
        if (logger) {
            logger.write_error("SystemFunctions.read_file_json", msg);
        } else {
            console.error(msg);
        }
        return { data: null, error: msg };
    }
}

export function read_file_yaml<T>(
    filename: string,
    logger?: ILogger
): ReadFileResult<T> {
    const data = read_file(filename, logger);
    if (data == null) {
        return { data: null, error: `read_file_yaml: could not read '${filename}'` };
    }
    try {
        const yaml = require("js-yaml") as typeof import("js-yaml");
        return { data: yaml.load(data) as T, error: null };
    } catch (error) {
        const msg = `read_file_yaml: failed to parse '${filename}': ${(error as Error).message}`;
        if (logger) {
            logger.write_error("SystemFunctions.read_file_yaml", msg);
        } else {
            console.error(msg);
        }
        return { data: null, error: msg };
    }
}

// ******** log level string to enum conversion

export function convert_from_log_level_string_to_enum(
    logLevelString: string
): LogLevel {
    switch (logLevelString.toLowerCase()) {
        case "error":
            return LogLevel.Error;
        case "warn":
            return LogLevel.Warn;
        case "info":
            return LogLevel.Info;
        case "debug":
            return LogLevel.Debug;
        default:
            // Unknown log level — default to Info (forward most messages)
            // rather than None (silently drop everything).
            return LogLevel.Info;
    }
}

// **** sleep functions

export async function sleep(delayMS: number): Promise<void> {
    if (typeof delayMS !== "number" || delayMS < 0) {
        throw new Error("delayMS must be a non-negative number");
    }
    if (delayMS === 0) {
        return Promise.resolve(); // Resolves immediately
    }
    return new Promise((resolve) => setTimeout(resolve, delayMS)); // Normal sleep
}

// **** general functions

export function randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// **** time-related functions

export function get_timestamp_iso(): string {
    return new Date().toISOString().slice(0, -1);
}

export function get_timestamp(include_ms: boolean): string {
    // init
    const dt = new Date();

    // get date and time components
    const year = String(dt.getFullYear());
    const month = String(dt.getMonth() + 1).padStart(2, "0");
    const day = String(dt.getDate()).padStart(2, "0");
    const h = String(dt.getHours()).padStart(2, "0");
    const m = String(dt.getMinutes()).padStart(2, "0");
    const s = String(dt.getSeconds()).padStart(2, "0");
    const ms = String(dt.getMilliseconds()).padStart(3, "0");

    // get the timestamp
    let dude = `${year}-${month}-${day} ${h}:${m}:${s}`;

    // check if including milliseconds
    if (include_ms) {
        dude = `${dude}.${ms}`;
    }

    // return results
    return dude;
}

/**
 * @param start_time - Populate with a Date.now()
 * @returns Returns a string formatted to show the elapsed time
 */
export function elapsed_time(start_time: Date | undefined): string {
    let start_time_value = Date.now();

    if (start_time !== undefined) {
        start_time_value = start_time.valueOf();
    }

    return formatElapsedTime(Date.now() - start_time_value);
}

export function elapsed_time_seconds(start_date: Date): number {
    return (Date.now() - start_date.valueOf()) / 1000;
}

export function formatElapsedTime(ms: number): string {
    // Calculate hours, minutes, seconds, and remaining milliseconds
    const hours = Math.floor(ms / 3600000);
    ms %= 3600000; // Remaining milliseconds after hours
    const minutes = Math.floor(ms / 60000);
    ms %= 60000; // Remaining milliseconds after minutes
    const seconds = Math.floor(ms / 1000);
    const milliseconds = ms % 1000; // Remaining milliseconds

    // Format the result
    const hours_str = hours.toString().padStart(2, "0");
    const minutes_str = minutes.toString().padStart(2, "0");
    const seconds_str = seconds.toString().padStart(2, "0");
    const ms_str = milliseconds.toString().padStart(3, "0");
    return `${hours_str}:${minutes_str}:${seconds_str}.${ms_str}`;
}
