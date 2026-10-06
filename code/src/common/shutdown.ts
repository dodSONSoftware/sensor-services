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
 * Hard shutdown timeout (ms): the safety-net duration index.ts arms while the
 * graceful shutdown sequence runs. Anything that terminates this process must
 * allow at least this long — docker-compose.yml therefore sets
 * stop_grace_period: 20s (Docker's default of 10s would SIGKILL the process
 * mid-shutdown). The compose value is pinned against this constant in
 * tests/__tests__/docker/docker.test.ts.
 */
export const HARD_SHUTDOWN_TIMEOUT_MS = 15_000;

/**
 * Normalize an arbitrary fatal-error value into a diagnostic log message
 * (Optional-1). The values reaching the `uncaughtException` /
 * `unhandledRejection` handlers are not guaranteed to be Error instances, so
 * both fatal handlers in index.ts route through here — a non-Error value can
 * never log as "undefined". Error values keep their stack; everything else is
 * normalized through ensureError().
 */
export function formatFatalError(prefix: string, value: unknown): string {
    const err = ensureError(value);
    // Only a genuine Error input carries a meaningful stack — ensureError()
    // wraps non-Error values in a fresh Error whose stack just points into
    // the normalizer itself, so appending it would be noise.
    return `${prefix}: ${err.message}${value instanceof Error && err.stack ? `\n${err.stack}` : ""}`;
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
    // close() is async and bounded (flushes/closes the Loki transport) and
    // never rejects, so awaiting it here is safe and guarantees the final log
    // has been flushed before the caller exits.
    let loggerClosed = false;
    const closeLoggerOnce = async () => {
        if (!loggerClosed) {
            loggerClosed = true;
            // close() may be async (the app Logger flushes the Loki transport,
            // bounded, and never rejects) or a synchronous no-op (test fakes /
            // the ILogger surface, which does not declare close()). Await only
            // when a promise is returned.
            const result = appLogger.close() as unknown;
            if (result instanceof Promise) {
                await result.catch(() => { /* best effort */ });
            }
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
        // 5. Close the active logger — after the final log, before the exit.
        //    Awaited so the Loki transport flush completes (bounded) before
        //    the caller exits; nothing may log after this resolves.
        await closeLoggerOnce();
    }
}
