/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import type { Request as ExpressRequest } from "express";

/**
 * Express Request augmented with an optional request ID set by the request-ID middleware.
 * The ID is optional because not all Express apps run this middleware.
 * When present, it enables log correlation across the app, MQTT, and metrics.
 */
export interface AppRequest extends ExpressRequest {
    id?: string;
}
