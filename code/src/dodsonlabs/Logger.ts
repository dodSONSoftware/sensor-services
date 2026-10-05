/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import winston from "winston";
import type Transport from "winston-transport";
import LokiTransport from "winston-loki";
import { LogLevel } from "./Interfaces";
import { formatElapsedTime } from "./SystemFunctions";
import { reqId } from "../common/global";
import type { configSchema } from "../schemas/config";
import type { z } from "zod";
import type { ILogger } from "./Interfaces";

// Bound for flushing/closing the Loki transport during application shutdown.
// A hung or unreachable Loki must never block process termination.
export const LOKI_CLOSE_TIMEOUT_MS = 5000;

/**
 * Structural view of the winston-loki transport surface this application
 * relies on at shutdown. The package's .d.ts only declares flush(); the
 * underlying Batcher (exposed as `batcher`) offers close(callback) which
 * stops the batch loop, performs a final flush, and invokes the callback on
 * completion — the transport's own close() discards that completion, so we
 * wrap the batcher to make the final flush awaitable and bounded.
 */
export type LokiTransportLike = Transport & {
    flush?: () => Promise<unknown>;
    close?: () => void;
    batcher?: { close: (callback?: () => void) => void };
};

/**
 * Flush and close the Loki transport in a bounded, best-effort manner:
 *  1. flush() waits for in-flight batches (bounded by timeoutMs).
 *  2. batcher.close(callback) stops the batch loop and does a final flush,
 *     awaited via the completion callback (bounded by timeoutMs).
 * Never throws — a Loki failure must not abort application shutdown.
 */
export async function closeLokiTransportBounded(
    transport: LokiTransportLike | null,
    timeoutMs: number = LOKI_CLOSE_TIMEOUT_MS
): Promise<void> {
    if (!transport) {
        return;
    }

    // Shared deadline for both phases — a single hung phase can never exceed
    // the bound, and a later phase reuses the remaining wall clock.
    const deadline = new Promise<void>((resolve) => {
        const timer = setTimeout(() => resolve(), timeoutMs);
        timer.unref();
    });

    // 1. Flush in-flight batches (best effort, bounded).
    try {
        if (typeof transport.flush === "function") {
            await Promise.race([transport.flush(), deadline]);
        }
    } catch {
        // ignore — bounded, best effort
    }

    // 2. Stop the batch loop and do a final flush, awaited and bounded.
    try {
        if (transport.batcher && typeof transport.batcher.close === "function") {
            await Promise.race([
                new Promise<void>((resolve) => transport.batcher!.close(() => resolve())),
                deadline,
            ]);
        } else if (typeof transport.close === "function") {
            transport.close();
        }
    } catch {
        // ignore — bounded, best effort
    }
}

// Map our LogLevel enum to Winston level priority
const LOG_LEVEL_MAP: Record<LogLevel, string> = {
    [LogLevel.None]: "silent",
    [LogLevel.Error]: "error",
    [LogLevel.Warn]: "warn",
    [LogLevel.Info]: "info",
    [LogLevel.Debug]: "debug",
};

function logLevelFromString(level: z.infer<typeof configSchema>["log-level"]): LogLevel {
    return level === "debug" ? LogLevel.Debug
        : level === "info" ? LogLevel.Info
            : level === "warn" ? LogLevel.Warn
                : LogLevel.Error;
}

/**
 * Structured logger backed by Winston with optional Loki remote transport.
 * Implements the ILogger interface so all existing callers work unchanged.
 */
export class Logger implements ILogger {
    // ********
    // ******** ctor

    constructor(config: z.infer<typeof configSchema>) {
        this.global_log_level_value = logLevelFromString(config["log-level"]);
        this.global_log_level_name = config["log-level"];

        // Build Winston logger with configured transports
        const transports: Transport[] = [
      // Console transport — human-readable, mirrors previous format
      new winston.transports.Console({
          format: winston.format.combine(
              winston.format.timestamp(),
              winston.format.errors({ stack: true }),
              winston.format.printf(({ timestamp, level, message, originator, elapsed, reqId: entryReqId }) => {
                  const header = `[${timestamp}][${elapsed ?? "00:00:00.000"}][${level.toUpperCase().padEnd(5, " ")}][${originator}]`;
                  const idTag = entryReqId ? `[${entryReqId}]` : "";
                  return `${header} ${idTag} ${message}`;
              })
          ),
      }) as Transport,
        ];

        // Add Loki transport when configured and enabled
        const lokiUrl = config["loki-url"];
        const lokiEnabled = config["loki-enabled"];
        if (lokiUrl && lokiEnabled) {
            const loki = new LokiTransport({
                host: lokiUrl,
                labels: { app: "sensor-services", env: "production" },
                format: winston.format.combine(
                    winston.format.timestamp(),
                    winston.format.json()
                ),
                // Disable winston-loki's automatic process-exit behavior. By
                // default it registers its own SIGINT/SIGTERM handler (via
                // async-exit-hook) that can call process.exit() before the
                // application's ordered shutdown sequence finishes. The
                // application is the sole owner of signals and process
                // termination; close() below explicitly flushes and closes the
                // Loki transport during that sequence.
                gracefulShutdown: false,
            }) as unknown as LokiTransportLike;
            transports.push(loki as unknown as Transport);
            this.lokiTransport = loki;
        }

        this.winston = winston.createLogger({
            level: LOG_LEVEL_MAP[this.global_log_level_value],
            levels: winston.config.npm.levels,
            transports,
            exitOnError: false,
        });
    }

    // ********
    // ******** private properties

    private global_log_level_value: LogLevel = LogLevel.None;
    private global_log_level_name: string = "";
    private readonly winston: winston.Logger;
    // The Loki transport (when configured) so close() can explicitly flush and
    // close it. Kept as a structural type (LokiTransportLike) because the
    // package's declared type omits the batcher surface used at shutdown.
    private lokiTransport: LokiTransportLike | null = null;
    // Idempotency guard: close() must run its transport cleanup exactly once.
    private closeStarted = false;

    /**
     * Change the log level on the EXISTING instance (hot reload of log-level).
     * Replacing the logger instance on a level change is not safe: long-lived
     * components (MqttNetworking, controllers, index.ts) hold references to
     * the original instance, and the replacement would leave them logging
     * through a closed logger. Transports (console/Loki) are untouched —
     * loki-url/loki-enabled changes remain restart-required.
     */
    setLevel(level: z.infer<typeof configSchema>["log-level"]): void {
        this.global_log_level_value = logLevelFromString(level);
        this.global_log_level_name = level;

        this.winston.level = LOG_LEVEL_MAP[this.global_log_level_value];
    }

    // ********
    // ******** ILogger functions

    global_log_level(): LogLevel {
        return this.global_log_level_value;
    }

    global_log_level_string(): string {
        return this.global_log_level_name;
    }

    /**
     * Close the logger. Flushes and closes the Loki transport explicitly
     * (bounded, best-effort) and then closes all transports via Winston.
     * Resolves only after the bounded transport cleanup completes, so the
     * caller (application shutdown) can await it before exiting.
     *
     * Bounded: the Loki flush/close is raced against LOKI_CLOSE_TIMEOUT_MS,
     * so a hung or unreachable Loki cannot block process shutdown.
     * Idempotent: a second call is a no-op.
     * Never rejects: every transport-close failure is swallowed so shutdown
     * can never be aborted by a logging dependency.
     *
     * Config reload must not close the logger — it changes the level in place
     * (setLevel) so long-lived references stay valid.
     */
    async close(): Promise<void> {
        if (this.closeStarted) {
            return;
        }
        this.closeStarted = true;

        // 1. Explicitly flush + close the Loki transport (final batch flush),
        //    bounded so it cannot hang shutdown.
        await closeLokiTransportBounded(this.lokiTransport);

        // 2. Close all transports via Winston (console close is a no-op; the
        //    Loki batcher was already stopped above, so its re-close here is a
        //    safe no-op). Never let a transport close failure abort shutdown.
        try {
            this.winston.close();
        } catch {
            // ignore — shutdown must not be interrupted by transport errors
        }
    }

    write_debug(
        originator: string,
        message: string,
        elapsed_time_start_date: Date = new Date(),
        requestId: string = reqId(),
    ): void {
        this.winston.log({
            level: "debug",
            message,
            originator,
            elapsed: formatElapsedTime(Date.now() - elapsed_time_start_date.getTime()),
            reqId: requestId,
        });
    }

    write_info(
        originator: string,
        message: string,
        elapsed_time_start_date: Date = new Date(),
        requestId: string = reqId(),
    ): void {
        this.winston.log({
            level: "info",
            message,
            originator,
            elapsed: formatElapsedTime(Date.now() - elapsed_time_start_date.getTime()),
            reqId: requestId,
        });
    }

    write_warn(
        originator: string,
        message: string,
        elapsed_time_start_date: Date = new Date(),
        requestId: string = reqId(),
    ): void {
        this.winston.log({
            level: "warn",
            message,
            originator,
            elapsed: formatElapsedTime(Date.now() - elapsed_time_start_date.getTime()),
            reqId: requestId,
        });
    }

    write_error(
        originator: string,
        message: string,
        elapsed_time_start_date: Date = new Date(),
        requestId: string = reqId(),
    ): void {
        this.winston.log({
            level: "error",
            message,
            originator,
            elapsed: formatElapsedTime(Date.now() - elapsed_time_start_date.getTime()),
            reqId: requestId,
        });
    }
}
