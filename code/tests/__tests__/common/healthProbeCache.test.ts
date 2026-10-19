/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import {
    probeDependencyHealth,
    resetHealthProbeCache,
} from "../../../src/common/healthProbeCache";

describe("probeDependencyHealth (rejection hardening)", () => {
    beforeEach(() => {
        resetHealthProbeCache();
    });

    it("should resolve a rejecting probe to false instead of rejecting", async () => {
        const probe = jest.fn(() => Promise.reject(new Error("probe blew up")));

        await expect(
            probeDependencyHealth("http://probe:9999/health", probe)
        ).resolves.toBe(false);
    });

    it("should cache a rejected probe's false like any negative result", async () => {
        const probe = jest.fn(() => Promise.reject(new Error("probe blew up")));

        const first = await probeDependencyHealth("http://probe:9999/health", probe);
        const second = await probeDependencyHealth("http://probe:9999/health", probe);

        expect(first).toBe(false);
        expect(second).toBe(false);
        // Cached for the TTL: the probe fires exactly once
        expect(probe).toHaveBeenCalledTimes(1);
    });

    it("should share one rejecting probe across concurrent callers", async () => {
        const probe = jest.fn(
            () => new Promise<boolean>((_resolve, reject) => setTimeout(() => reject(new Error("probe blew up")), 5))
        );

        const [a, b] = await Promise.all([
            probeDependencyHealth("http://probe:9999/health", probe),
            probeDependencyHealth("http://probe:9999/health", probe),
        ]);

        expect(a).toBe(false);
        expect(b).toBe(false);
        expect(probe).toHaveBeenCalledTimes(1);
    });

    it("should let resetHealthProbeCache clear a cached rejection", async () => {
        probeDependencyHealth("http://probe:9999/health", () => Promise.reject(new Error("boom")));
        resetHealthProbeCache();

        await expect(
            probeDependencyHealth("http://probe:9999/health", () => Promise.resolve(true))
        ).resolves.toBe(true);
    });
});
