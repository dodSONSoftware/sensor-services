/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import type express from "express";
import { EventEmitter } from "events";
import {
    BEARER_AUTHORIZATION_SHAPE,
    RESTART_FALLBACK_DELAY_MS,
    RestartService,
    SERVICE_TOKEN_PATTERN,
} from "../../../src/controllers/restartController";
import { logger, setLogger } from "../../../src/common/global";
import type { Logger } from "../../../src/dodsonlabs/Logger";

// A valid token of EXACTLY 32 characters — the boundary of the validity rule
// (this file doubles as the "exactly 32 is valid" pin).
const TOKEN = "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6";
// A DISTINCT 32-character secret standing in for ip-pinger-config-token:
// leaking one must never grant the other.
const OTHER_SECRET = "Zz9Yy8Xx7Ww6Vv5Uu4Tt3Ss2Rr1Qq0Pp";
const SOCKET = "192.168.1.50";

// The byte-identical disabled 503 body — redeclared as a literal in each
// state section below (never shared) so byte-identity across halves is
// proven without shared state.
const DISABLED_503_BODY = '{"success":false,"message":"Restart endpoint is disabled."}';

/**
 * Response surface the controller drives (status/setHeader/json) plus the
 * EventEmitter "finish" funnel. Mirrors the express.Response calls used.
 */
class MockRes extends EventEmitter {
    public readonly headers = new Map<string, string>();
    public statusCode: number | undefined;
    public body: unknown;

    public setHeader(key: string, value: string): this {
        this.headers.set(key.toLowerCase(), value);
        return this;
    }

    public status(code: number): this {
        this.statusCode = code;
        return this;
    }

    public json(body: unknown): this {
        this.body = body;
        return this;
    }
}

interface MockReqOptions {
    method?: string;
    // Every Authorization line sent, in order. Node's parser would surface
    // only the FIRST in req.headers and drop the rest — rawHeaders keeps all.
    authorization?: string[];
    remoteAddress?: string;
}

function createMockReq({
    method = "POST",
    authorization = [],
    remoteAddress = SOCKET,
}: MockReqOptions = {}): express.Request {
    const rawHeaders: string[] = [];
    for (const value of authorization) {
        rawHeaders.push("authorization", value);
    }
    const headers: Record<string, string> = {};
    if (authorization.length > 0) {
        headers["authorization"] = authorization[0]; // first value only
    }
    return {
        method,
        headers,
        rawHeaders,
        socket: { remoteAddress },
        on: jest.fn(),
    } as unknown as express.Request;
}

interface FakeLogger {
    write_debug: jest.Mock;
    write_info: jest.Mock;
    write_warn: jest.Mock;
    write_error: jest.Mock;
}

let fakeLogger: FakeLogger;

beforeEach(() => {
    fakeLogger = {
        write_debug: jest.fn(),
        write_info: jest.fn(),
        write_warn: jest.fn(),
        write_error: jest.fn(),
    };
    setLogger(fakeLogger as unknown as Logger);
});

/** Every message logged by any level, originator included. */
function allLoggedMessages(): string[] {
    const calls = [
        ...fakeLogger.write_debug.mock.calls,
        ...fakeLogger.write_info.mock.calls,
        ...fakeLogger.write_warn.mock.calls,
        ...fakeLogger.write_error.mock.calls,
    ];
    return calls.map((c) => c.join(" "));
}

function messagesContaining(needle: string): string[] {
    return allLoggedMessages().filter((m) => m.includes(needle));
}

/** Yield to the macrotask queue so a setImmediate-scheduled hop can run. */
function settle(ms = 10): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// A short fallback window for the scheduling tests (the production default of
// RESTART_FALLBACK_DELAY_MS would hold a pending timer across the suite).
const FAST_FALLBACK_MS = 30;

describe("token constants", () => {
    it("SERVICE_TOKEN_PATTERN accepts exactly-32 and longer alphanumerics, rejects the rest", () => {
        expect(SERVICE_TOKEN_PATTERN.test(TOKEN)).toBe(true); // exactly 32
        expect(SERVICE_TOKEN_PATTERN.test(`${TOKEN}xy`)).toBe(true); // 34
        expect(SERVICE_TOKEN_PATTERN.test(TOKEN.slice(0, 31))).toBe(false); // 31
        expect(SERVICE_TOKEN_PATTERN.test(`${TOKEN.slice(0, 30)}--`)).toBe(false); // non-alphanumeric
        expect(SERVICE_TOKEN_PATTERN.test("")).toBe(false);
    });

    it("BEARER_AUTHORIZATION_SHAPE enforces the exact scheme shape", () => {
        expect(BEARER_AUTHORIZATION_SHAPE.exec(`Bearer ${TOKEN}`)?.[1]).toBe(TOKEN);
        expect(BEARER_AUTHORIZATION_SHAPE.exec(`bearer ${TOKEN}`)).toBeNull(); // case-sensitive scheme
        expect(BEARER_AUTHORIZATION_SHAPE.exec(`Bearer  ${TOKEN}`)).toBeNull(); // two spaces
        expect(BEARER_AUTHORIZATION_SHAPE.exec(`Bearer ${TOKEN} `)).toBeNull(); // trailing whitespace
        expect(BEARER_AUTHORIZATION_SHAPE.exec("Bearer a, Bearer b")).toBeNull(); // comma-joined
        expect(BEARER_AUTHORIZATION_SHAPE.exec("Bearer")).toBeNull(); // no token
    });

    it("RESTART_FALLBACK_DELAY_MS pins the production fallback window", () => {
        expect(RESTART_FALLBACK_DELAY_MS).toBe(2000);
    });
});

describe("enablement (constructor states)", () => {
    it("unset token: warns restart_token_not_set, never announces enabled", () => {
        new RestartService(undefined, jest.fn(), FAST_FALLBACK_MS);
        expect(messagesContaining("restart_token_not_set")).toHaveLength(1);
        expect(messagesContaining("restart_endpoint_enabled")).toHaveLength(0);
    });

    it("empty token: warns restart_token_not_set, never announces enabled", () => {
        new RestartService("", jest.fn(), FAST_FALLBACK_MS);
        expect(messagesContaining("restart_token_not_set")).toHaveLength(1);
        expect(messagesContaining("restart_endpoint_enabled")).toHaveLength(0);
    });

    it("set-but-invalid (31 chars): warns restart_token_invalid, never announces enabled", () => {
        new RestartService(TOKEN.slice(0, 31), jest.fn(), FAST_FALLBACK_MS);
        expect(messagesContaining("restart_token_invalid")).toHaveLength(1);
        expect(messagesContaining("restart_endpoint_enabled")).toHaveLength(0);
    });

    it("set-but-invalid (non-alphanumeric): warns restart_token_invalid, never announces enabled", () => {
        new RestartService(`${TOKEN.slice(0, 30)}--`, jest.fn(), FAST_FALLBACK_MS);
        expect(messagesContaining("restart_token_invalid")).toHaveLength(1);
        expect(messagesContaining("restart_endpoint_enabled")).toHaveLength(0);
    });

    it("valid token + hook: announces restart_endpoint_enabled (info)", () => {
        new RestartService(TOKEN, jest.fn(), FAST_FALLBACK_MS);
        expect(messagesContaining("restart_endpoint_enabled")).toHaveLength(1);
        expect(messagesContaining("restart_token_not_set")).toHaveLength(0);
        expect(messagesContaining("restart_token_invalid")).toHaveLength(0);
    });

    it("valid token, no hook: warns, and the enabled announcement must not fire", () => {
        new RestartService(TOKEN, undefined, FAST_FALLBACK_MS);
        expect(messagesContaining("restart_endpoint_enabled")).toHaveLength(0);
        expect(fakeLogger.write_warn).toHaveBeenCalled();
    });

    it("the token value is never logged in any state, at any level", () => {
        const states: (string | undefined)[] = [undefined, "", "x", TOKEN.slice(0, 31), `${TOKEN.slice(0, 30)}--`, TOKEN, OTHER_SECRET];
        for (const state of states) {
            fakeLogger.write_debug.mockClear();
            fakeLogger.write_info.mockClear();
            fakeLogger.write_warn.mockClear();
            fakeLogger.write_error.mockClear();
            new RestartService(state, jest.fn(), FAST_FALLBACK_MS);
            for (const message of allLoggedMessages()) {
                expect(message).not.toContain(TOKEN);
                expect(message).not.toContain(OTHER_SECRET);
            }
        }
    });
});

describe("method gate (405 before everything)", () => {
    it("non-POST gets 405 with Allow: POST and no-store — the hook is never reached", () => {
        const hook = jest.fn();
        const service = new RestartService(TOKEN, hook, FAST_FALLBACK_MS);
        const res = new MockRes();
        for (const method of ["GET", "PUT", "DELETE", "PATCH"]) {
            res.statusCode = undefined;
            res.body = undefined;
            service.handle(createMockReq({ method, authorization: [`Bearer ${TOKEN}`] }), res);
            expect(res.statusCode).toBe(405);
            expect(res.headers.get("allow")).toBe("POST");
            expect(res.headers.get("cache-control")).toBe("no-store");
            expect(JSON.stringify(res.body)).toBe('{"success":false,"message":"Method not allowed."}');
        }
        expect(hook).not.toHaveBeenCalled();
    });

    it("405 is checked BEFORE enablement: a disabled endpoint also answers 405 to non-POST", () => {
        const service = new RestartService(undefined, jest.fn(), FAST_FALLBACK_MS);
        const res = new MockRes();
        service.handle(createMockReq({ method: "GET" }), res);
        expect(res.statusCode).toBe(405);
        expect(res.headers.get("allow")).toBe("POST");
    });
});

describe("disabled endpoint (fail-closed halves)", () => {
    it("missing token half: byte-identical 503, audited as restart_disabled", () => {
        const service = new RestartService("", jest.fn(), FAST_FALLBACK_MS);
        const res = new MockRes();
        service.handle(createMockReq(), res);
        expect(res.statusCode).toBe(503);
        expect(JSON.stringify(res.body)).toBe(DISABLED_503_BODY);
        expect(res.headers.get("cache-control")).toBe("no-store");
        expect(messagesContaining("restart_disabled")).toHaveLength(1);
        expect(messagesContaining("restart_disabled")[0]).toContain(SOCKET);
    });

    it("missing hook half: the SAME byte-identical 503 (no config probing)", () => {
        const service = new RestartService(TOKEN, undefined, FAST_FALLBACK_MS);
        const res = new MockRes();
        service.handle(createMockReq(), res);
        expect(res.statusCode).toBe(503);
        expect(JSON.stringify(res.body)).toBe(DISABLED_503_BODY);
    });

    it("a plausible Bearer cannot grant enablement against a disabled endpoint (503, not 401, not 202)", () => {
        const hook = jest.fn();
        const service = new RestartService("", hook, FAST_FALLBACK_MS);
        const res = new MockRes();
        service.handle(createMockReq({ authorization: [`Bearer ${OTHER_SECRET}`] }), res);
        expect(res.statusCode).toBe(503);
        expect(JSON.stringify(res.body)).toBe(DISABLED_503_BODY);
        expect(hook).not.toHaveBeenCalled();
    });
});

describe("bearer authentication (enabled endpoint)", () => {
    function enabled(): { service: RestartService; hook: jest.Mock } {
        const hook = jest.fn();
        return { service: new RestartService(TOKEN, hook, FAST_FALLBACK_MS), hook };
    }

    it("missing Authorization header: 401 + WWW-Authenticate: Bearer + exact body", () => {
        const { service } = enabled();
        const res = new MockRes();
        service.handle(createMockReq(), res);
        expect(res.statusCode).toBe(401);
        expect(res.headers.get("www-authenticate")).toBe("Bearer");
        expect(res.headers.get("cache-control")).toBe("no-store");
        expect(JSON.stringify(res.body)).toBe('{"success":false,"message":"missing or invalid Authorization header"}');
        expect(messagesContaining("restart_token_rejected")).toHaveLength(1);
    });

    it("rejects malformed schemes before any comparison", () => {
        const { service, hook } = enabled();
        const malformed = [
            `bearer ${TOKEN}`, // case-sensitive scheme
            `Bearer  ${TOKEN}`, // two spaces
            `Bearer ${TOKEN} `, // trailing whitespace
            "Bearer a, Bearer b", // comma-joined
            "Bearer", // no token
            "Basic dXNlcjpwYXNz", // wrong scheme
        ];
        for (const header of malformed) {
            const res = new MockRes();
            service.handle(createMockReq({ authorization: [header] }), res);
            expect(res.statusCode).toBe(401);
            expect(res.headers.get("www-authenticate")).toBe("Bearer");
        }
        expect(hook).not.toHaveBeenCalled();
    });

    it("duplicate Authorization headers are rejected before any comparison", () => {
        const { service, hook } = enabled();
        const res = new MockRes();
        // Two raw header lines: req.headers surfaces only the first, so the
        // rawHeaders count is the only thing that can see the duplicate.
        service.handle(createMockReq({ authorization: [`Bearer ${TOKEN}`, `Bearer ${TOKEN}`] }), res);
        expect(res.statusCode).toBe(401);
        expect(hook).not.toHaveBeenCalled();
    });

    it("a wrong token of the same length is rejected (constant-time path)", () => {
        const { service, hook } = enabled();
        const res = new MockRes();
        service.handle(createMockReq({ authorization: [`Bearer ${OTHER_SECRET}`] }), res);
        expect(res.statusCode).toBe(401);
        expect(hook).not.toHaveBeenCalled();
    });

    it("a wrong-length token is rejected (length pre-check, never reaches timingSafeEqual)", () => {
        const { service, hook } = enabled();
        const res = new MockRes();
        service.handle(createMockReq({ authorization: [`Bearer ${TOKEN.slice(0, 31)}`] }), res);
        expect(res.statusCode).toBe(401);
        expect(hook).not.toHaveBeenCalled();
    });

    it("the config token (a distinct secret) is never accepted in its place", () => {
        const { service, hook } = enabled();
        const res = new MockRes();
        service.handle(createMockReq({ authorization: [`Bearer ${OTHER_SECRET}`] }), res);
        expect(res.statusCode).toBe(401);
        expect(hook).not.toHaveBeenCalled();
    });

    it("rejects when the header value is not a string (defensive: raw line present, header dropped)", () => {
        const { service, hook } = enabled();
        const req = {
            method: "POST",
            headers: {}, // value absent even though the raw line exists
            rawHeaders: ["authorization", `Bearer ${TOKEN}`],
            socket: { remoteAddress: SOCKET },
            on: jest.fn(),
        } as unknown as express.Request;
        const res = new MockRes();
        service.handle(req, res);
        expect(res.statusCode).toBe(401);
        expect(hook).not.toHaveBeenCalled();
    });

    it("the rejection audit carries the socket address but never the header value", () => {
        const { service } = enabled();
        const header = `Bearer ${OTHER_SECRET}`;
        const res = new MockRes();
        service.handle(createMockReq({ authorization: [header] }), res);
        expect(res.statusCode).toBe(401);
        const audits = messagesContaining("restart_token_rejected");
        expect(audits).toHaveLength(1);
        expect(audits[0]).toContain(SOCKET);
        for (const message of allLoggedMessages()) {
            expect(message).not.toContain(OTHER_SECRET);
            expect(message).not.toContain(header);
        }
    });
});

describe("acceptance and single-flight (enabled endpoint)", () => {
    it("202 contract: exact body, no-store + Connection: close, audited once", () => {
        const hook = jest.fn();
        const service = new RestartService(TOKEN, hook, FAST_FALLBACK_MS);
        const res = new MockRes();
        service.handle(createMockReq({ authorization: [`Bearer ${TOKEN}`] }), res);
        expect(res.statusCode).toBe(202);
        expect(JSON.stringify(res.body)).toBe('{"success":true,"status":"restart_scheduled","message":"Service restart requested"}');
        expect(res.headers.get("cache-control")).toBe("no-store");
        expect(res.headers.get("connection")).toBe("close");
        expect(messagesContaining("service_restart_requested")).toHaveLength(1);
        expect(hook).not.toHaveBeenCalled(); // NOT yet — the response goes out first
    });

    it("the callback fires exactly once, only after the response finished", async () => {
        const hook = jest.fn();
        const service = new RestartService(TOKEN, hook, FAST_FALLBACK_MS);
        const res = new MockRes();
        service.handle(createMockReq({ authorization: [`Bearer ${TOKEN}`] }), res);
        expect(hook).not.toHaveBeenCalled();

        res.emit("finish");
        await settle();
        expect(hook).toHaveBeenCalledTimes(1);
        await settle(FAST_FALLBACK_MS * 3); // the fallback timer expires; still once
        expect(hook).toHaveBeenCalledTimes(1);
    });

    it("a second POST while the first is pending gets 409 (sequential single-flight)", () => {
        const hook = jest.fn();
        const service = new RestartService(TOKEN, hook, FAST_FALLBACK_MS);
        const first = new MockRes();
        service.handle(createMockReq({ authorization: [`Bearer ${TOKEN}`] }), first);
        expect(first.statusCode).toBe(202);

        const second = new MockRes();
        service.handle(createMockReq({ authorization: [`Bearer ${TOKEN}`] }), second);
        expect(second.statusCode).toBe(409);
        expect(JSON.stringify(second.body)).toBe('{"success":false,"message":"Restart already in progress."}');
    });

    it("duplicate POSTs in the same tick: exactly one 202 and one 409 (concurrent single-flight)", () => {
        const hook = jest.fn();
        const service = new RestartService(TOKEN, hook, FAST_FALLBACK_MS);
        const a = new MockRes();
        const b = new MockRes();
        // Same tick: the guard is set synchronously before the first 202 is
        // written, so the second cannot slip between check and set.
        service.handle(createMockReq({ authorization: [`Bearer ${TOKEN}`] }), a);
        service.handle(createMockReq({ authorization: [`Bearer ${TOKEN}`] }), b);
        const statuses = [a.statusCode, b.statusCode].sort();
        expect(statuses).toEqual([202, 409]);
        a.emit("finish");
        b.emit("finish");
        return settle().then(() => expect(hook).toHaveBeenCalledTimes(1));
    });

    it("client-disconnect fallback: the restart is honored even when finish never fires", async () => {
        const hook = jest.fn();
        const service = new RestartService(TOKEN, hook, FAST_FALLBACK_MS);
        const res = new MockRes();
        service.handle(createMockReq({ authorization: [`Bearer ${TOKEN}`] }), res);
        expect(res.statusCode).toBe(202);
        // No finish event — the client vanished before the response flushed.
        expect(hook).not.toHaveBeenCalled();
        await settle(FAST_FALLBACK_MS * 4);
        expect(hook).toHaveBeenCalledTimes(1);
    });

    it("the scheduler is idempotent: finish after the fallback never double-fires", async () => {
        const hook = jest.fn();
        const service = new RestartService(TOKEN, hook, FAST_FALLBACK_MS);
        const res = new MockRes();
        service.handle(createMockReq({ authorization: [`Bearer ${TOKEN}`] }), res);
        await settle(FAST_FALLBACK_MS * 4); // fallback fires first
        expect(hook).toHaveBeenCalledTimes(1);
        res.emit("finish"); // late finish — must not fire a second time
        await settle();
        expect(hook).toHaveBeenCalledTimes(1);
    });

    it("swallows request-stream error/aborted events (a vanished client cannot crash the process)", () => {
        const hook = jest.fn();
        const service = new RestartService(TOKEN, hook, FAST_FALLBACK_MS);
        const handlers: Record<string, jest.Mock> = {};
        const req = createMockReq({ authorization: [`Bearer ${TOKEN}`] });
        (req.on as unknown as jest.Mock).mockImplementation((event: string, fn: jest.Mock) => {
            handlers[event] = fn;
            return req;
        });
        const res = new MockRes();
        service.handle(req, res);
        expect(res.statusCode).toBe(202);

        // The client vanished mid-body: both events fire, neither may throw
        // (an unhandled "error" on the stream is ERR_UNHANDLED_ERROR).
        handlers["error"](new Error("ECONNRESET"));
        handlers["aborted"]();

        // The accepted restart still proceeds exactly once.
        return settle(FAST_FALLBACK_MS * 4).then(() => expect(hook).toHaveBeenCalledTimes(1));
    });

    it("a throwing callback still answered 202, logs restart_callback_failed, and releases the guard", async () => {
        const hook = jest.fn().mockImplementation(() => {
            throw new Error("boom");
        });
        const service = new RestartService(TOKEN, hook, FAST_FALLBACK_MS);
        const res = new MockRes();
        service.handle(createMockReq({ authorization: [`Bearer ${TOKEN}`] }), res);
        expect(res.statusCode).toBe(202); // accepted — the client was told so

        await settle(FAST_FALLBACK_MS * 4); // fallback fires, callback throws
        const failures = messagesContaining("restart_callback_failed");
        expect(failures).toHaveLength(1);
        expect(failures[0]).toContain("boom");

        // No shutdown started — a later request must be able to retry
        // instead of a permanent 409, and the callback gets a fresh chance.
        const retry = new MockRes();
        service.handle(createMockReq({ authorization: [`Bearer ${TOKEN}`] }), retry);
        expect(retry.statusCode).toBe(202);
        hook.mockImplementation(() => { /* now succeeds */ });
        retry.emit("finish");
        await settle();
        expect(hook).toHaveBeenCalledTimes(2);
        expect(messagesContaining("restart_callback_failed")).toHaveLength(1); // still exactly once
    });
});

// Sanity: the global logger the controller reads is the one the tests arm.
describe("test harness", () => {
    it("logger() resolves to the armed fake logger", () => {
        expect(logger()).toBe(fakeLogger as unknown as Logger);
    });
});
