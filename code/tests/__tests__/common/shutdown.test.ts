/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import { runGracefulShutdown, type ShutdownResources } from "../../../src/common/shutdown";

/**
 * Fakes the Logger surface runGracefulShutdown() uses, recording call order.
 */
function makeFakeLogger(calls: string[]) {
    return {
        write_info: jest.fn().mockImplementation((_origin: string, message: string) => {
            calls.push(`info:${message}`);
        }),
        write_error: jest.fn().mockImplementation((_origin: string, message: string) => {
            calls.push(`error:${message}`);
        }),
        close: jest.fn().mockImplementation(() => {
            calls.push("close");
        }),
    };
}

function makeResources(overrides: Partial<ShutdownResources> = {}): ShutdownResources {
    return {
        closeHttpServer: jest.fn().mockResolvedValue(undefined),
        closeNetworking: jest.fn().mockResolvedValue(undefined),
        closeSettingsStore: jest.fn().mockResolvedValue(undefined),
        ...overrides,
    };
}

describe("runGracefulShutdown (logger close lifecycle)", () => {
    it("should close resources in order, emit the final log before close, and close the logger exactly once before the caller exits", async () => {
        const calls: string[] = [];
        const logger = makeFakeLogger(calls);
        const resources = makeResources();
        const startTime = Date.now() - 60_000;

        // Resolution of the returned promise is the caller's exit point:
        // the process exit (index.ts) happens only after this resolves.
        await runGracefulShutdown(resources, logger, startTime);

        expect(resources.closeHttpServer).toHaveBeenCalledTimes(1);
        expect(resources.closeNetworking).toHaveBeenCalledTimes(1);
        expect(resources.closeNetworking).toHaveBeenCalledWith(5000);
        expect(resources.closeSettingsStore).toHaveBeenCalledTimes(1);

        // Final shutdown log was emitted while the logger was still open
        expect(calls.some((c) => /^info:Graceful shutdown complete\. Uptime: /.test(c))).toBe(true);

        // The logger closes exactly once — never duplicated
        expect(logger.close).toHaveBeenCalledTimes(1);

        // Ordering: resource closes -> final log -> close (close is last)
        const closeIndex = calls.indexOf("close");
        const finalLogIndex = calls.findIndex((c) => c.startsWith("info:Graceful shutdown complete."));
        expect(finalLogIndex).toBeGreaterThan(-1);
        expect(closeIndex).toBeGreaterThan(finalLogIndex);
        expect(closeIndex).toBe(calls.length - 1);
    });

    it("should close the logger exactly once and log the failure before close when a resource close fails", async () => {
        const calls: string[] = [];
        const logger = makeFakeLogger(calls);
        const resources = makeResources({
            closeNetworking: jest.fn().mockRejectedValue(new Error("mqtt close failed")) as jest.Mock,
        });

        await runGracefulShutdown(resources, logger, Date.now());

        // The failing resource is reported while the logger is still open
        expect(logger.write_error).toHaveBeenCalledTimes(1);
        expect(logger.write_error).toHaveBeenCalledWith(
            "shutdown.ts",
            "Error during graceful shutdown: mqtt close failed"
        );

        // No further resources are attempted after the failure
        expect(resources.closeSettingsStore).not.toHaveBeenCalled();

        // The logger still closes exactly once, and nothing is logged after close
        expect(logger.close).toHaveBeenCalledTimes(1);
        const closeIndex = calls.indexOf("close");
        expect(closeIndex).toBe(calls.length - 1);
    });

    it("should close the logger exactly once when the final log emission fails", async () => {
        const calls: string[] = [];
        const logger = makeFakeLogger(calls);
        (logger.write_info as jest.Mock).mockImplementation(() => {
            throw new Error("log transport failure");
        });
        const resources = makeResources();

        await runGracefulShutdown(resources, logger, Date.now());

        expect(logger.write_error).toHaveBeenCalledTimes(1);
        expect(logger.close).toHaveBeenCalledTimes(1);
        expect(calls).toEqual(["error:Error during graceful shutdown: log transport failure", "close"]);
    });
});
