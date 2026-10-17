/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import { readFileSync } from "fs";
import { join } from "path";

/**
 * Source pins for the restart-service lifecycle dispatch in index.ts.
 *
 * The HTTP layer may only REQUEST a restart; index.ts owns the process and
 * must answer by self-signaling SIGTERM — the SAME graceful path an operator
 * `docker stop` takes (MQTT disconnect, bounded HTTP drain, logger flush,
 * exit-code ownership). Calling process.exit directly would bypass all of
 * that, and calling Docker is not possible (no socket/CLI/SDK, non-root user).
 */
describe("restart-service lifecycle dispatch (index.ts)", () => {
    const src = readFileSync(join(__dirname, "..", "..", "src", "index.ts"), "utf8");

    function requestRestartBody(): string {
        const match = /const requestRestart = \(\): void => \{([\s\S]*?)\};/.exec(src);
        expect(match).not.toBeNull();
        return match![1];
    }

    it("requestRestart self-signals SIGTERM", () => {
        expect(requestRestartBody()).toContain('process.kill(process.pid, "SIGTERM")');
    });

    it("the restart path contains no direct process.exit", () => {
        expect(requestRestartBody()).not.toContain("process.exit");
    });

    it("wires the hook into the restart routes at construction", () => {
        expect(src).toMatch(/new restartRoutes\.CreateRestartRoutes\(app, process\.env\["RESTART_SERVICE_TOKEN"\], requestRestart\)/);
    });
});
