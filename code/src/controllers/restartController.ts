/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import type express from "express";
import { timingSafeEqual } from "crypto";
import {
    Accepted,
    Conflict,
    MethodNotAllowed,
    ServiceUnavailable,
    Unauthorized,
} from "../dodsonlabs/HttpConstants";
import { ensureError } from "../dodsonlabs/SystemFunctions";
import { logger } from "../common/global";

// Token validity rule: 32 or more ASCII alphanumeric characters — the same
// rule the config schema enforces for ip-pinger-config-token
// (src/schemas/config.ts), so `openssl rand -hex 32` produces a valid token.
// The charset is ASCII-only, so character count equals byte count and there
// are no multibyte edge cases. This is a DISTINCT secret from
// ip-pinger-config-token: the config token is never accepted here and this
// token is never a valid x-config-token.
export const SERVICE_TOKEN_PATTERN = /^[A-Za-z0-9]{32,}$/;

// Strict Authorization header shape: one case-sensitive "Bearer" scheme, a
// single space, one token with no embedded whitespace. Catches comma-joined
// values ("Bearer a, Bearer b") and any other malformation.
export const BEARER_AUTHORIZATION_SHAPE = /^Bearer (\S+)$/;

// Bounded fallback for the scheduling guarantee: if the 202 response never
// reaches "finish" (the client disconnected before it flushed), the accepted
// restart is still honored after this delay. The process is exiting shortly
// either way, so the window is only a safety net — it keeps restartPending
// from wedging forever without outliving the graceful-shutdown budget.
export const RESTART_FALLBACK_DELAY_MS = 2000;

/**
 * Token-gated POST /restart-service.
 *
 * Optional and FAIL-CLOSED with no enable flag: a valid RESTART_SERVICE_TOKEN
 * (the only thing that can turn the endpoint on) AND an injected
 * requestRestart hook must both be present. Missing either half answers the
 * same byte-identical 503, so a client cannot probe which half a deployment
 * lacks. A bad token can only ever disable the endpoint, never crash
 * startup, and its value is never logged in any state at any level.
 *
 * The class only REQUESTS a restart: it invokes the injected lifecycle hook
 * (index.ts self-signals SIGTERM — the same graceful path `docker stop`
 * takes) and never touches `process` itself.
 */
export class RestartService {
    // Validated token captured once at startup (undefined = disabled half one);
    // a running process's enablement cannot change without a restart (which is
    // itself a token-gated operation).
    private readonly restartToken: string | undefined;
    // The lifecycle hook (undefined = disabled half two).
    private readonly requestRestart?: () => void;
    // Injectable for tests (the production window is RESTART_FALLBACK_DELAY_MS).
    private readonly fallbackDelayMs: number;

    // Single-flight guard: set synchronously, before the 202 is written, so a
    // duplicate POST in the same tick cannot slip between the check and the
    // set. It latches for the process lifetime on success (the process is
    // exiting, so the latch is never observable in production) and is released
    // ONLY when the callback itself throws (no shutdown started, so a later
    // request must be able to retry instead of a permanent 409).
    private restartPending = false;
    // Armed fallback timer (cleared on first fire and by the scheduler).
    private fallbackTimer: NodeJS.Timeout | undefined;

    // **** ctor

    /**
     * @param rawToken    The UNVALIDATED RESTART_SERVICE_TOKEN environment
     *                    variable value (may be undefined or empty).
     * @param requestRestart  The lifecycle hook (index.ts self-signals SIGTERM).
     * @param fallbackDelayMs  Override of the fallback window (tests).
     */
    constructor(
        rawToken: string | undefined,
        requestRestart?: () => void,
        fallbackDelayMs: number = RESTART_FALLBACK_DELAY_MS
    ) {
        this.requestRestart = requestRestart;
        this.fallbackDelayMs = fallbackDelayMs;

        if (rawToken === undefined || rawToken === "") {
            this.restartToken = undefined;
            // The token VALUE is never logged in any state, at any level.
            logger()?.write_warn(
                "restartController.ts/RestartService",
                "restart_token_not_set: RESTART_SERVICE_TOKEN is unset or empty; POST /restart-service is disabled."
            );
        } else if (SERVICE_TOKEN_PATTERN.test(rawToken)) {
            this.restartToken = rawToken;
            if (requestRestart === undefined) {
                // Valid token but no hook: the second half of the fail-closed
                // check is missing, so the endpoint is still disabled — and the
                // enabled announcement must not fire.
                logger()?.write_warn(
                    "restartController.ts/RestartService",
                    "restart_hook_missing: RESTART_SERVICE_TOKEN is valid but no shutdown hook was injected; POST /restart-service is disabled."
                );
            } else {
                logger()?.write_info(
                    "restartController.ts/RestartService",
                    "restart_endpoint_enabled: POST /restart-service is enabled."
                );
            }
        } else {
            // Set-but-invalid: disables the endpoint (never refuses startup —
            // a startup refusal would crash-loop the whole service over one
            // optional endpoint). The value is not echoed back.
            this.restartToken = undefined;
            logger()?.write_warn(
                "restartController.ts/RestartService",
                "restart_token_invalid: RESTART_SERVICE_TOKEN does not meet the validity rule (32+ alphanumeric characters); POST /restart-service is disabled."
            );
        }
    }

    // **** public functions

    /**
     * Handles a request to /restart-service (any verb — the route is
     * registered with .all() so wrong methods can answer 405 with
     * Allow: POST; this app has no global 405).
     *
     * Status ladder, in order — each gate runs only if the previous one
     * passed:
     *   1. method is not POST              -> 405 + Allow: POST
     *   2. endpoint disabled (a half missing) -> byte-identical 503
     *   3. missing/invalid Authorization   -> 401 + WWW-Authenticate: Bearer
     *   4. a restart is already pending    -> 409
     *   5. accepted                        -> 202 (scheduled, not completed)
     */
    handle(req: express.Request, res: express.Response): void {
        // Every response from this endpoint (405/503/401/409/202) inherits this
        // — set at entry, before any sub-call, so a cache must never serve a
        // restart decision.
        res.setHeader("Cache-Control", "no-store");

        // The request stream is never consumed: the body is irrelevant, so a
        // client that sends one and vanishes cannot wedge the handler. A
        // vanished client would otherwise make the request stream emit "error"
        // (e.g. ECONNRESET) or "aborted"; an unhandled "error" on the stream
        // throws ERR_UNHANDLED_ERROR and kills the process. Swallow and audit
        // only — the response is already ended by the time either can fire.
        req.on("error", () => { /* swallowed: response already sent */ });
        req.on("aborted", () => { /* swallowed: response already sent */ });

        // 1. method check — before authentication and enablement.
        if (req.method !== "POST") {
            res.setHeader("Allow", "POST");
            res.status(MethodNotAllowed).json({ success: false, message: "Method not allowed." });
            return;
        }

        // 2. fail-closed enablement: BOTH halves must be present. The disabled
        //    503 is byte-identical regardless of which half is missing (no
        //    token, or no hook) — a distinct "missing callback" status would
        //    open a config-probing channel. A request header can never grant
        //    enablement: a well-formed Bearer against a disabled endpoint
        //    still answers 503, not 401 and not 202.
        if (this.restartToken === undefined || this.requestRestart === undefined) {
            logger()?.write_warn(
                "restartController.ts/handle",
                `restart_disabled from ${this.socketAddress(req)}`
            );
            res.status(ServiceUnavailable).json({ success: false, message: "Restart endpoint is disabled." });
            return;
        }

        // 3. Bearer authentication (the token is always a validated secret here).
        const supplied = this.extractBearerToken(req);
        if (supplied === null || !this.constantTimeEquals(supplied, this.restartToken)) {
            // The audit carries the directly observed socket address for
            // forensics — never the token or the header value.
            logger()?.write_warn(
                "restartController.ts/handle",
                `restart_token_rejected from ${this.socketAddress(req)}`
            );
            res.status(Unauthorized).setHeader("WWW-Authenticate", "Bearer")
                .json({ success: false, message: "missing or invalid Authorization header" });
            return;
        }

        // 4. single-flight: set synchronously, BEFORE the response is written.
        if (this.restartPending) {
            res.status(Conflict).json({ success: false, message: "Restart already in progress." });
            return;
        }
        this.restartPending = true;

        // 5. accepted — then schedule AFTER the response has been delivered.
        // 202 means scheduled, not completed: the process may exit before the
        // client finishes reading. The caller should verify the new process
        // with /health.
        logger()?.write_info(
            "restartController.ts/handle",
            `service_restart_requested from ${this.socketAddress(req)}`
        );
        // The process is about to exit, so the socket must not linger in a
        // keep-alive pool while shutdown drains the server.
        res.setHeader("Connection", "close");
        res.status(Accepted).json({
            success: true,
            status: "restart_scheduled",
            message: "Service restart requested",
        });

        this.scheduleRestart(req, res);
    }

    // **** private functions

    /**
     * Fires the lifecycle hook exactly once, after the 202 has been delivered.
     * Two funnels feed one single-fire scheduler:
     *   - res "finish" (the normal path: bytes flushed) wrapped in setImmediate
     *     so the HTTP handler unwinds (and the client receives the bytes)
     *     before process lifecycle is touched — shutdown() closes the HTTP
     *     server, and a response still flushing cannot be closed out from
     *     under it;
     *   - a bounded fallback timer, for the case where "finish" never fires
     *     because the client disconnected first — an accepted restart is still
     *     honored when the client vanishes.
     */
    private scheduleRestart(_req: express.Request, res: express.Response): void {
        let fired = false;
        const run = (): void => {
            if (fired) {
                return; // idempotent: the callback never runs twice
            }
            fired = true;
            if (this.fallbackTimer !== undefined) {
                clearTimeout(this.fallbackTimer);
                this.fallbackTimer = undefined;
            }
            try {
                this.requestRestart?.();
            } catch (err) {
                // No shutdown started: release the guard so a later request can
                // retry instead of a permanent 409, and keep the fault from
                // reaching the uncaughtException handler and taking a healthy
                // process down over a recoverable error.
                this.restartPending = false;
                logger()?.write_error(
                    "restartController.ts/scheduleRestart",
                    `restart_callback_failed: ${ensureError(err).message}`
                );
            }
        };

        res.once("finish", () => {
            setImmediate(run);
        });
        this.fallbackTimer = setTimeout(run, this.fallbackDelayMs);
    }

    /**
     * Extracts the Bearer token from the Authorization header, enforcing an
     * exact header shape. Returns null (a definitive reject) on any
     * malformation.
     */
    private extractBearerToken(req: express.Request): string | null {
        // Exactly ONE Authorization header. Node's parser surfaces only the
        // FIRST value in req.headers and silently drops duplicates, so the
        // count must come from req.rawHeaders, which preserves every line. A
        // duplicate is rejected before any comparison.
        const authLines = req.rawHeaders.filter((h: string) => h.toLowerCase() === "authorization");
        if (authLines.length !== 1) {
            return null;
        }
        const header = req.headers["authorization"];
        if (typeof header !== "string") {
            return null;
        }
        const match = BEARER_AUTHORIZATION_SHAPE.exec(header);
        return match === null ? null : match[1];
    }

    /**
     * Constant-time compare. Both buffers are length-checked first: a length
     * mismatch is a definitive reject that never reaches timingSafeEqual
     * (which throws on unequal-length buffers).
     */
    private constantTimeEquals(supplied: string, expected: string): boolean {
        const a = Buffer.from(supplied, "utf8");
        const b = Buffer.from(expected, "utf8");
        if (a.length !== b.length) {
            return false;
        }
        return timingSafeEqual(a, b);
    }

    /** The directly observed socket address for audit forensics. */
    private socketAddress(req: express.Request): string {
        return req.socket.remoteAddress ?? "unknown";
    }
}
