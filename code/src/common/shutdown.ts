/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import type { Logger } from "../dodsonlabs/Logger";
import { ensureError, formatElapsedTime } from "../dodsonlabs/SystemFunctions";

/**
 * Runtime resources the graceful shutdown sequence closes, in order.
 */
export interface ShutdownResources {
    /** Stop accepting new HTTP requests (resolves when the server has closed). */
    closeHttpServer: () => Promise<void>;
    /** Close the MQTT client, bounded by a timeout (ms). */
    closeNetworking: (timeoutMs: number) => Promise<void>;
    /** Clean up persistence resources (settings store). */
    closeSettingsStore: () => Promise<void>;
}

/**
 * Run the graceful shutdown sequence: close the HTTP server, the MQTT client,
 * and the settings store; emit the final shutdown log message; then close the
 * active logger exactly once so buffered transports (e.g. the Loki batch
 * timer) flush their final records.
 *
 * The logger is closed in a finally block with a once-guard, so it closes
 * exactly once on every path — success, resource failure, or a failure while
 * emitting the final log. Nothing may log after this resolves. The process
 * exit itself is the caller's responsibility (index.ts exits 0 after this
 * resolves; a hard timeout safety net is managed there as well).
 */
export async function runGracefulShutdown(
    resources: ShutdownResources,
    appLogger: Logger,
    startTime: number
): Promise<void> {
    // Once-guard: the logger must close exactly once, never duplicated.
    let loggerClosed = false;
    const closeLoggerOnce = () => {
        if (!loggerClosed) {
            loggerClosed = true;
            appLogger.close();
        }
    };

    try {
        // 1. Stop accepting new HTTP requests
        await resources.closeHttpServer();

        // 2. Close MQTT client with a timeout
        await resources.closeNetworking(5000);

        // 3. Clean up persistence resources
        await resources.closeSettingsStore();

        // 4. Final shutdown log message — emitted while the logger is still open
        appLogger.write_info("shutdown.ts", `Graceful shutdown complete. Uptime: ${formatElapsedTime(Date.now() - startTime)}.`);
    } catch (err) {
        // Log the failure before closing the logger
        appLogger.write_error("shutdown.ts", `Error during graceful shutdown: ${ensureError(err).message}`);
    } finally {
        // 5. Close the active logger — after the final log, before the exit
        closeLoggerOnce();
    }
}
