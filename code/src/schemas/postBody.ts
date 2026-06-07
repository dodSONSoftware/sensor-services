/*
 * Copyright (c) 2025-2026 dodson Software ( dodson labs )
 * Author: Randy Dodson <dodsonsoftware@gmail.com>
 * Licensed under the MIT License with Patent Grant and NOTICE preservation.
 * See the LICENSE file for the full terms.
 */

import { z } from "zod";

/**
 * Validates that a request body is a plain object (not an array, string, number, etc.).
 * The actual keys/values are left unconstrained — downstream code decides what's allowed.
 * This prevents injection of non-object types that could cause unexpected behaviour.
 */
export const postBodySchema = z.object({}).passthrough();

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
