/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

/**
 * Result TTL (ms) for dependency health probes.
 *
 * Deliberately hard-coded, not a config key: the value tunes against two
 * other fixed values — the 2.5s probe bound in generalController (which must
 * stay under Docker's 5s healthcheck deadline) and the Docker healthcheck
 * interval — and a config key would mean a schema entry, a CONFIGURATION.md
 * section, a reload policy and boundary tests for zero operational benefit.
 */
export const HEALTH_PROBE_TTL_MS = 5000;

interface ProbeEntry {
    promise: Promise<boolean>;
    /** Epoch ms after which a caller triggers a fresh probe. */
    expiresAt: number;
}

// Keyed by probe URL: URLs are stable per process (only log-level
// hot-reloads, and probe URLs are not hot-reloaded), and the same URL is
// naturally shared by every caller of the probe for that dependency.
const probeCache = new Map<string, ProbeEntry>();

/**
 * Run a dependency health probe with a short TTL shared by every caller
 * (single-flight: concurrent callers during the probe window share one
 * in-flight probe instead of double-firing).
 *
 * Whatever the probe resolves to — including `false` — is cached for the
 * TTL. Caching negative results is the point of the cache: without it a
 * dead dependency would keep triggering a full bounded probe per request,
 * and the probe endpoint is rate-limit-exempt, so a dead dependency becomes
 * an unbounded amplifier of downstream load.
 *
 * Contract: `probe` must never reject — a rejecting probe would poison the
 * cached promise for the whole TTL. Both current probes (the /health
 * dependency checks) catch internally and resolve `false` on failure.
 */
export function probeDependencyHealth(url: string, probe: () => Promise<boolean>): Promise<boolean> {
    const existing = probeCache.get(url);
    if (existing && existing.expiresAt > Date.now()) {
        return existing.promise;
    }

    const promise = probe();
    // Stored SYNCHRONOUSLY, with a non-expiring TTL, so a second caller that
    // arrives while the probe is still in flight gets the same promise. The
    // probe is bounded by AbortSignal.timeout in the caller, so the
    // placeholder cannot outlive the probe.
    probeCache.set(url, { promise, expiresAt: Number.POSITIVE_INFINITY });
    void promise.then((healthy) => {
        probeCache.set(url, { promise: Promise.resolve(healthy), expiresAt: Date.now() + HEALTH_PROBE_TTL_MS });
    });
    return promise;
}

/**
 * Clear all cached probe results. Exported for tests so the module-level
 * cache cannot leak state between test cases (pattern: LOKI_CLOSE_TIMEOUT_MS
 * in Logger.test.ts).
 */
export function resetHealthProbeCache(): void {
    probeCache.clear();
}
