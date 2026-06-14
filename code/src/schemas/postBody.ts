/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import { z } from "zod";

/**
 * Validates that a request body is a plain object (not an array, string, number, etc.).
 * The actual keys/values are left unconstrained — downstream code decides what's allowed.
 * Rejects `constructor` and `prototype` keys to prevent prototype pollution.
 * (Zod's `.object({})` already strips `__proto__` automatically.)
 */
const hasOwn = Object.prototype.hasOwnProperty.call.bind(Object.prototype.hasOwnProperty);

export const postBodySchema = z
    .object({})
    .passthrough()
    .refine(
        (obj) =>
            !hasOwn(obj, "constructor") &&
            !hasOwn(obj, "prototype"),
        { message: "request body contains disallowed keys" }
    );

/**
 * Parses and validates a request body against the postBodySchema.
 * Returns the parsed object on success, or null on failure (caller should send an error response).
 */
export function validatePostBody(body: unknown): Record<string, unknown> | null {
    const result = postBodySchema.safeParse(body);
    if (!result.success) {
        return null;
    }
    return result.data as Record<string, unknown>;
}
