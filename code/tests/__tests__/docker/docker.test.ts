/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import { readFileSync } from "fs";
import { join } from "path";
import * as yaml from "js-yaml";
import { validateConfig } from "../../../src/schemas/config";
import { HARD_SHUTDOWN_TIMEOUT_MS } from "../../../src/common/shutdown";

/**
 * P3-8 static guards for the Docker build.
 *
 * These pin the invariants that are cheap to check without a Docker daemon
 * (the full end-to-end checks — build, start, mounted-config precedence,
 * swagger — live in tests/docker/verify.sh and run where Docker is available):
 *
 * - the builder runs the project's canonical build (npm run build) instead of
 *   re-implementing its steps by hand,
 * - the built-in dist/config.yml (copied from src/config.yml by the build) is
 *   a complete, independently valid configuration — a container with no
 *   mounted config starts from it,
 * - only the src/routes subset is copied for Swagger, not the entire source tree,
 * - the container WORKDIR keeps the canonical CWD-relative config fallback
 *   (./dist/config.yml) working, so a container without a mounted config starts
 *   exactly like bare metal (a mounted /app/configs/config.yml takes precedence),
 * - the compose service sets a stop_grace_period that exceeds the application's
 *   internal hard shutdown timeout (HARD_SHUTDOWN_TIMEOUT_MS) — Docker's
 *   default 10s grace would SIGKILL the process mid-shutdown otherwise.
 */
const codeRoot = join(__dirname, "..", "..", "..");
const dockerfile = readFileSync(join(codeRoot, "Dockerfile"), "utf8");

/**
 * Parse a Docker Compose duration (bare number, or number + s/m/h unit) into
 * milliseconds.
 */
function composeDurationToMs(value: string): number {
    const match = /^(\d+)([smh])?$/.exec(value.trim());
    if (!match) {
        throw new Error(`unrecognized compose duration: "${value}"`);
    }
    const amount = Number(match[1]);
    const unit = match[2] ?? "s";
    return amount * (unit === "h" ? 3_600_000 : unit === "m" ? 60_000 : 1_000);
}

describe("Dockerfile (P3-8)", () => {
    it("runs the canonical build in the builder stage", () => {
        expect(dockerfile).toMatch(/RUN npm run build/);
        // The old manual step (bare tsc with no config copy) must be gone from
        // the build stage: the canonical script is the single source of truth.
        const builderSection = dockerfile.split("FROM node:22 AS builder")[1]!.split("FROM node:22")[0];
        expect(builderSection).not.toMatch(/RUN npx tsc\b/);
    });

    it("copies only the src/routes subset for Swagger, not the whole source tree", () => {
        expect(dockerfile).toMatch(/COPY --from=builder \/app\/src\/routes/);
        // /app/src must never appear as a standalone copy source (that would
        // copy the entire source tree) — i.e. followed by whitespace or EOL,
        // not by a path continuation like /routes.
        expect(dockerfile).not.toMatch(/COPY\s+--from=builder\s+\/app\/src(?=[\s\n]|$)/m);
    });

    it("resolves the CWD-relative config fallback the same way bare metal does (WORKDIR /app, node dist/index.js)", () => {
        // index.ts reads /app/configs/config.yml first, then falls back to
        // ./dist/config.yml relative to the CWD. With WORKDIR /app that is
        // /app/dist/config.yml — the same default bare metal resolves
        // (code/dist/config.yml). The old WORKDIR /app/dist resolved it to
        // /app/dist/dist/config.yml, a path that never exists, so the
        // container's fallback diverged from bare metal. A mounted
        // /app/configs/config.yml always takes precedence over the built-in
        // fallback (see tests/docker/verify.sh).
        expect(dockerfile).not.toMatch(/WORKDIR \/app\/dist/);
        expect(dockerfile).toMatch(/WORKDIR \/app/);
        expect(dockerfile).toMatch(/CMD \["node", "dist\/index\.js"\]/);
    });
});

describe("built-in configuration (P3-8)", () => {
    it("is a complete, independently valid configuration", () => {
        // src/config.yml is what the canonical build copies to dist/config.yml —
        // the configuration a container starts from when nothing is mounted.
        // It must satisfy the schema on its own (including db-password).
        const raw = yaml.load(
            readFileSync(join(codeRoot, "src", "config.yml"), "utf8")
        ) as Record<string, unknown>;
        const config = validateConfig(raw);
        expect(config["db-password"]).toBeTruthy();
    });
});

describe("docker-compose.yml (shutdown budget)", () => {
    // The graceful shutdown sequence (HTTP drain -> MQTT close (5s) -> settings
    // store -> logger close) runs under a hard safety net of
    // HARD_SHUTDOWN_TIMEOUT_MS. Docker Compose's default stop grace period is
    // 10s — shorter — so an unconfigured `docker compose stop` SIGKILLs the
    // process while it is still closing MQTT/settings or flushing the logger.
    // The compose file must therefore carry an explicit stop_grace_period
    // longer than the application's own hard cap.
    const compose = yaml.load(
        readFileSync(join(codeRoot, "docker-compose.yml"), "utf8")
    ) as { services: Record<string, { stop_grace_period?: string }> };
    const service = compose.services["sensor-services"];

    it("declares a sensor-services service", () => {
        expect(service).toBeDefined();
    });

    it("sets a stop_grace_period longer than the application's hard shutdown timeout", () => {
        expect(service).toBeDefined();
        expect(service!.stop_grace_period).toBeDefined();
        const graceMs = composeDurationToMs(service!.stop_grace_period!);
        expect(graceMs).toBeGreaterThan(HARD_SHUTDOWN_TIMEOUT_MS);
    });
});
