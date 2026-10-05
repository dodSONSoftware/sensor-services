/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import { readFileSync } from "fs";
import { join } from "path";

/**
 * P3-8 static guards for the Docker build.
 *
 * These pin the invariants that are cheap to check without a Docker daemon
 * (the full end-to-end checks — build, start, no secrets, swagger — live in
 * tests/docker/verify.sh and run where Docker is available):
 *
 * - the builder runs the project's canonical build (npm run build) instead of
 *   re-implementing its steps by hand,
 * - config-secrets.yml can never enter the build context or the image,
 * - only the src/routes subset is copied for Swagger, not the entire source tree,
 * - the container WORKDIR keeps the canonical CWD-relative config fallback
 *   (./dist/config.yml) working, so a container without a mounted config starts
 *   exactly like bare metal (a mounted /app/configs/config.yml takes precedence).
 */
const codeRoot = join(__dirname, "..", "..", "..");
const dockerfile = readFileSync(join(codeRoot, "Dockerfile"), "utf8");
const dockerignore = readFileSync(join(codeRoot, ".dockerignore"), "utf8");

describe("Dockerfile (P3-8)", () => {
    it("runs the canonical build in the builder stage", () => {
        expect(dockerfile).toMatch(/RUN npm run build/);
        // The old manual step (bare tsc with no config copy) must be gone from
        // the build stage: the canonical script is the single source of truth.
        const builderSection = dockerfile.split("FROM node:22 AS builder")[1]!.split("FROM node:22")[0];
        expect(builderSection).not.toMatch(/RUN npx tsc\b/);
    });

    it("never copies config-secrets.yml into the image", () => {
        // Only COPY instructions can bring the file into an image layer;
        // comments mentioning the filename are fine.
        const copyLines = dockerfile.split("\n").filter((line) => /^\s*COPY\b/i.test(line));
        for (const line of copyLines) {
            expect(line).not.toMatch(/config-secrets\.yml/);
        }
        // The explicit rm after the canonical build is the defense-in-depth guard.
        expect(dockerfile).toMatch(/rm -f dist\/config-secrets\.yml/);
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
        // /app/dist/config.yml — the same secret-free default bare metal
        // resolves (code/dist/config.yml). The old WORKDIR /app/dist resolved
        // it to /app/dist/dist/config.yml, a path that never exists, so the
        // container's fallback diverged from bare metal. Note the fallback is
        // NOT a standalone working config: the committed default carries no
        // db-password (a secret), so a container still requires a mounted
        // config to supply credentials (see tests/docker/verify.sh).
        expect(dockerfile).not.toMatch(/WORKDIR \/app\/dist/);
        expect(dockerfile).toMatch(/WORKDIR \/app/);
        expect(dockerfile).toMatch(/CMD \["node", "dist\/index\.js"\]/);
    });
});

describe(".dockerignore (P3-8)", () => {
    it("excludes config-secrets.yml from the build context", () => {
        const lines = dockerignore.split("\n").map((l) => l.trim());
        expect(lines).toContain("config-secrets.yml");
        expect(lines).toContain("**/config-secrets.yml");
    });
});
