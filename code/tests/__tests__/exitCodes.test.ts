/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

// P2-2: process exit-code contract.
//
//   SIGINT / SIGTERM            -> 0  (clean, operator-requested stop)
//   uncaughtException /
//   unhandledRejection          -> 1  (fatal fault — a crash, not a clean stop)
//   fatal startup error
//   (e.g. invalid config)       -> 1
//   EADDRINUSE (bind failure)   -> 1
//
// These are integration tests: they spawn the COMPILED app (dist/index.js) as a
// child process and assert the real exit code. They require `npm run build` to
// have produced dist/index.js; when it is absent (e.g. a bare `npm test` on a
// fresh checkout) the suite is skipped rather than failing.

import * as cp from "child_process";
import * as net from "net";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as yaml from "js-yaml";

const APP = path.join(__dirname, "..", "..", "dist", "index.js");
const built = fs.existsSync(APP);

/** A schema-valid config (the schema is a strictObject — unknown keys are
 * rejected, so this lists exactly the required keys, nothing else). */
function validConfig(expressPort: number): Record<string, unknown> {
    return {
        "log-level": "info",
        "express-port": expressPort,
        "mqtt-broker-ip-address": "127.0.0.1",
        "mqtt-topic-command": "iot/v3/command",
        "mqtt-topic-command-response": "iot/v3/command-response",
        "ip-pinger-web-api": "http://127.0.0.1:39999",
        "case-sensitive": true,
        "db-host": "127.0.0.1",
        "db-port": 5432,
        "db-name": "sensor_exit_test",
        "db-user": "appuser",
        "db-password": "testpass",
    };
}

function invalidConfig(): Record<string, unknown> {
    // Missing the required db-password -> validation fails at startup -> exit 1.
    const cfg = validConfig(40000);
    delete cfg["db-password"];
    return cfg;
}

/** Spawn the compiled app with `config` written to <cwd>/dist/config.yml. */
function spawnApp(config: Record<string, unknown>, cwd: string): cp.ChildProcess {
    const distDir = path.join(cwd, "dist");
    fs.mkdirSync(distDir, { recursive: true });
    fs.writeFileSync(path.join(distDir, "config.yml"), yaml.dump(config));
    const child = cp.spawn(process.execPath, [APP], {
        cwd,
        env: { ...process.env, NODE_ENV: "test" },
        stdio: ["ignore", "pipe", "pipe"],
    });
    // Consume stdout/stderr so the child never blocks on a full pipe buffer
    // (the app logs a lot at startup). We discard the data — these tests assert
    // only on the exit code.
    const consume = (): void => { /* drain */ };
    child.stdout?.on("data", consume);
    child.stderr?.on("data", consume);
    return child;
}

function getFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
        const srv = net.createServer();
        srv.listen(0, "127.0.0.1", () => {
            const port = (srv.address() as net.AddressInfo).port;
            srv.close(() => resolve(port));
        });
        srv.on("error", reject);
    });
}

function waitForPort(port: number, timeoutMs: number): Promise<void> {
    const start = Date.now();
    return new Promise((resolve, reject) => {
        const tryConnect = () => {
            const socket = net.connect(port, "127.0.0.1");
            socket.once("connect", () => {
                socket.destroy();
                resolve();
            });
            socket.once("error", () => {
                socket.destroy();
                if (Date.now() - start > timeoutMs) {
                    reject(new Error(`port ${port} not ready within ${timeoutMs}ms`));
                } else {
                    setTimeout(tryConnect, 100);
                }
            });
        };
        tryConnect();
    });
}

function waitForExit(
    child: cp.ChildProcess,
    timeoutMs: number
): Promise<{ code: number | null; signal: string | null }> {
    if (child.exitCode !== null || child.signalCode !== null) {
        return Promise.resolve({ code: child.exitCode, signal: child.signalCode });
    }
    return new Promise((resolve, reject) => {
        const timer = setTimeout(
            () => reject(new Error(`process did not exit within ${timeoutMs}ms`)),
            timeoutMs
        );
        child.once("exit", (code, signal) => {
            clearTimeout(timer);
            resolve({ code, signal });
        });
    });
}

const describeForBuild = built ? describe : describe.skip;

describeForBuild("process exit-code contract (P2-2, integration)", () => {
    const children: cp.ChildProcess[] = [];
    const tmpDirs: string[] = [];

    function track(child: cp.ChildProcess, cwd: string): void {
        children.push(child);
        tmpDirs.push(cwd);
    }

    function kill(child: cp.ChildProcess): void {
        if (child.exitCode === null && child.signalCode === null) {
            try {
                child.kill("SIGKILL");
            } catch {
                /* already gone */
            }
        }
    }

    afterAll(() => {
        for (const c of children) kill(c);
        for (const d of tmpDirs) {
            fs.rmSync(d, { recursive: true, force: true });
        }
    });

    it("exits 1 on a fatal startup error (invalid config)", async () => {
        const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "ss-exit-"));
        const child = spawnApp(invalidConfig(), cwd);
        track(child, cwd);
        const { code } = await waitForExit(child, 15_000);
        expect(code).toBe(1);
    });

    it("exits 0 on SIGTERM (clean, operator-requested stop)", async () => {
        const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "ss-exit-"));
        const port = await getFreePort();
        const child = spawnApp(validConfig(port), cwd);
        track(child, cwd);
        try {
            await waitForPort(port, 15_000);
            child.kill("SIGTERM");
            const { code } = await waitForExit(child, 20_000);
            expect(code).toBe(0);
        } finally {
            kill(child);
        }
    });

    it("exits 0 on SIGINT (clean, operator-requested stop)", async () => {
        const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "ss-exit-"));
        const port = await getFreePort();
        const child = spawnApp(validConfig(port), cwd);
        track(child, cwd);
        try {
            await waitForPort(port, 15_000);
            child.kill("SIGINT");
            const { code } = await waitForExit(child, 20_000);
            expect(code).toBe(0);
        } finally {
            kill(child);
        }
    });

    it("exits 1 when the HTTP port is already in use (EADDRINUSE)", async () => {
        const cwd1 = fs.mkdtempSync(path.join(os.tmpdir(), "ss-exit-"));
        const cwd2 = fs.mkdtempSync(path.join(os.tmpdir(), "ss-exit-"));
        const port = await getFreePort();
        const first = spawnApp(validConfig(port), cwd1);
        track(first, cwd1);
        let second: cp.ChildProcess | null = null;
        try {
            await waitForPort(port, 15_000); // first instance is listening
            second = spawnApp(validConfig(port), cwd2);
            track(second, cwd2);
            const { code } = await waitForExit(second, 15_000);
            // EADDRINUSE is a fatal startup error -> exit 1
            expect(code).toBe(1);
        } finally {
            if (second) kill(second);
            kill(first);
        }
    });
});
