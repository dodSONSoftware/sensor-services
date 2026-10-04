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

// Map our LogLevel enum to Winston level priority
const LOG_LEVEL_MAP: Record<LogLevel, string> = {
    [LogLevel.None]: "silent",
    [LogLevel.Error]: "error",
    [LogLevel.Warn]: "warn",
    [LogLevel.Info]: "info",
    [LogLevel.Debug]: "debug",
};

/**
 * Structured logger backed by Winston with optional Loki remote transport.
 * Implements the ILogger interface so all existing callers work unchanged.
 */
export class Logger implements ILogger {
    // ********
    // ******** ctor

    constructor(config: z.infer<typeof configSchema>) {
        this.global_log_level_value = config["log-level"] === "debug" ? LogLevel.Debug
            : config["log-level"] === "info" ? LogLevel.Info
                : config["log-level"] === "warn" ? LogLevel.Warn
                    : LogLevel.Error;

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
            transports.push(
        new LokiTransport({
            host: lokiUrl,
            labels: { app: "sensor-services", env: "production" },
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json()
            ),
        }) as unknown as Transport
            );
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

    private readonly global_log_level_value: LogLevel = LogLevel.None;
    private readonly global_log_level_name: string = "";
    private readonly winston: winston.Logger;

    // ********
    // ******** ILogger functions

    global_log_level(): LogLevel {
        return this.global_log_level_value;
    }

    global_log_level_string(): string {
        return this.global_log_level_name;
    }

    /**
     * Close the underlying Winston logger, flushing pending entries and
     * stopping transport timers (e.g. the Loki batch timer). Must be called
     * on a replaced logger (config reload) and at shutdown so transports
     * are not orphaned.
     */
    close(): void {
        this.winston.close();
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
