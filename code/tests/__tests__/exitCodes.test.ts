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

/** Source of src/index.ts, for the escalation wiring pins (loaded at module
 * scope — this is source text, not an import of the app). */
const INDEX_SRC = fs.readFileSync(path.join(__dirname, "..", "..", "src", "index.ts"), "utf8");

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
function spawnApp(config: Record<string, unknown>, cwd: string, extraEnv: Record<string, string> = {}): cp.ChildProcess {
    const distDir = path.join(cwd, "dist");
    fs.mkdirSync(distDir, { recursive: true });
    fs.writeFileSync(path.join(distDir, "config.yml"), yaml.dump(config));
    const child = cp.spawn(process.execPath, [APP], {
        cwd,
        env: { ...process.env, NODE_ENV: "test", ...extraEnv },
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

// Source pins for the exit-code escalation wiring (INVARIANTS #15).
//
// The re-entrancy guard absorbs a second shutdown() call, so the code the
// process finally exits with must be STATE that later callers can escalate —
// never the first caller's parameter. A fatal fault landing while a clean
// stop is in flight (the guard absorbs its shutdown(..., 1) call) must still
// exit 1, which only works if the handlers' codes flow through
// escalateExitCode() into the tracked final_exit_code, and the finally block
// exits THAT rather than the caller's exitCode.
describe("exit-code escalation wiring (source pin)", () => {
    it("fatal handlers request code 1 through shutdown(), not a direct process.exit", () => {
        expect(INDEX_SRC).toContain('shutdown("uncaughtException", 1)');
        expect(INDEX_SRC).toContain('shutdown("unhandledRejection", 1)');
    });

    it("shutdown() escalates the tracked code before the re-entrancy guard", () => {
        // The escalation statement must exist...
        expect(INDEX_SRC).toContain("final_exit_code = escalateExitCode(final_exit_code, exitCode);");
        // ...and sit BEFORE the guard inside shutdown(): the first guard
        // return after the function signature must come after the escalation.
        const fn = /async function shutdown\(signal: string, exitCode: number = 0\): Promise<void> \{([\s\S]*?)\n    \}/.exec(INDEX_SRC);
        expect(fn).not.toBeNull();
        const body = fn![1];
        expect(body.indexOf("escalateExitCode(")).toBeLessThan(body.indexOf("if (shutting_down)"));
    });

    it("the shutdown finally block exits the tracked code, never the caller's parameter", () => {
        expect(INDEX_SRC).toContain("process.exit(final_exit_code)");
        // The pre-fix shape — exiting the per-caller parameter — is gone.
        expect(INDEX_SRC).not.toContain("process.exit(exitCode)");
    });
});

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

    it("exits 0 on SIGTERM with an in-flight request (bounded HTTP drain)", async () => {
        // Regression: closeHttpServer() was a bare server.close(cb) with no bound
        // of its own. server.close() only resolves once EVERY connection is gone,
        // and on Node 22 an in-flight request (up to the 10s command cap) plus the
        // ~5s keep-alive idle drain could consume the whole 15s shutdown budget,
        // so the hard net fired process.exit(1) and the MQTT / settings / logger
        // cleanup was skipped. closeHttpServer() now force-closes all connections
        // after a short grace, bounding the HTTP step and letting the remaining
        // steps run. This reproduces that state without a broker: a keep-alive
        // POST whose body never arrives is held in-flight by the JSON body parser
        // — exactly the shape a slow sensor command occupies at shutdown.
        const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "ss-exit-"));
        const port = await getFreePort();
        const child = spawnApp(validConfig(port), cwd);
        track(child, cwd);
        let socket: net.Socket | null = null;
        try {
            await waitForPort(port, 15_000);
            // Start a request whose body never completes: headers (with a
            // declared Content-Length) are sent, but no body bytes follow. The
            // global express.json() middleware waits for the full body, so the
            // request is genuinely in-flight and will not finish on its own.
            socket = await new Promise<net.Socket>((resolve, reject) => {
                const s = net.connect(port, "127.0.0.1");
                s.once("connect", () => {
                    s.write(
                        `POST /sensors/write-config/testsensor HTTP/1.1\r\n` +
                        `Host: 127.0.0.1:${port}\r\n` +
                        `Content-Type: application/json\r\n` +
                        `Content-Length: 5000\r\n` +
                        `Connection: keep-alive\r\n` +
                        `\r\n`
                    );
                    resolve(s);
                });
                s.once("error", reject);
            });
            // Let the server accept the connection and start waiting on the body
            // so the request is registered as in-flight before the signal lands.
            await new Promise((r) => setTimeout(r, 500));
            child.kill("SIGTERM");
            const { code } = await waitForExit(child, 20_000);
            expect(code).toBe(0);
        } finally {
            socket?.destroy();
            kill(child);
        }
        // The unfixed shutdown runs to the 15s hard net before exiting 1, so this
        // test needs a window past that to reach the assertion; the fixed shutdown
        // exits ~4-5s into it.
    }, 25_000);

    it("exits 0 after a token-gated POST /restart-service (self-SIGTERM graceful path)", async () => {
        // End-to-end: the token-gated endpoint answers 202, then the process
        // self-signals SIGTERM and runs the SAME graceful shutdown an operator
        // `docker stop` triggers (bounded HTTP drain, MQTT close, settings
        // store, logger) — clean exit 0, which is what `restart: unless-stopped`
        // then acts on.
        const RESTART_TOKEN = "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6";
        const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "ss-exit-"));
        const port = await getFreePort();
        const child = spawnApp(validConfig(port), cwd, { RESTART_SERVICE_TOKEN: RESTART_TOKEN });
        track(child, cwd);
        try {
            await waitForPort(port, 15_000);
            // Assert the STATUS only — the 202 is best-effort (the process may
            // exit before the client finishes reading the body).
            const response = await fetch(`http://127.0.0.1:${port}/restart-service`, {
                method: "POST",
                headers: { Authorization: `Bearer ${RESTART_TOKEN}` },
            });
            expect(response.status).toBe(202);
            const { code } = await waitForExit(child, 20_000);
            expect(code).toBe(0);
        } finally {
            kill(child);
        }
    }, 40_000);

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
