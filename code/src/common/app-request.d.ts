/*
 * Copyright (c) 2025-2026 dodson Software ( dodson labs )
 * Author: Randy Dodson <dodsonsoftware@gmail.com>
 * Licensed under the MIT License with Patent Grant and NOTICE preservation.
 * See the LICENSE file for the full terms.
 */

import type { Request as ExpressRequest } from "express";

/**
 * Express Request augmented with an optional request ID set by the request-ID middleware.
 * The ID is optional because not all Express apps run this middleware (e.g. PrometheusWriter).
 * When present, it enables log correlation across the app, MQTT, and metrics.
 */
export interface AppRequest extends ExpressRequest {
    id?: string;
}
