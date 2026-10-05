/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import type express from "express";

/**
 * Enumerate the route paths actually registered on an Express app.
 *
 * Uses Express 4's stable (though undocumented) `app._router.stack`: each layer
 * that carries a `.route` is a registered route (path + methods); middleware
 * installed via `app.use` (JSON parser, 404 handler, ...) has no `.route` and
 * is excluded. A path registered for several methods
 * (`app.route(p).get().post()`) appears once.
 */
export function registeredRoutePaths(app: express.Application): string[] {
    const stack = (app as unknown as { _router?: { stack: { route?: { path: string } }[] } })._router?.stack ?? [];
    return stack.flatMap((layer) => (layer.route ? [layer.route.path] : []));
}

/**
 * Assert that the routes actually registered on `app` are exactly the union of
 * the declared per-module `__routes` (P3-4).
 *
 * Catches both directions of drift:
 *  - a route that is registered but never declared in any `__routes`
 *    (the live app exposes something the metadata forgot), and
 *  - a route declared in a `__routes` array but never registered
 *    (stale metadata pointing at a route that does not exist).
 *
 * Throws on any mismatch so the process fails fast at startup rather than
 * serving a route whose metadata is wrong.
 */
export function assertRoutesMatchDeclared(app: express.Application, declaredByModule: Record<string, string[]>): void {
    const registered = new Set(registeredRoutePaths(app));
    const declared = new Set<string>();
    for (const routes of Object.values(declaredByModule)) {
        for (const route of routes) declared.add(route);
    }
    const declaredButNotRegistered = [...declared].filter((p) => !registered.has(p));
    const registeredButNotDeclared = [...registered].filter((p) => !declared.has(p));
    if (declaredButNotRegistered.length || registeredButNotDeclared.length) {
        throw new Error(
            `route drift detected — declared but not registered: ${declaredButNotRegistered.join(", ") || "none"}, ` +
            `registered but not declared: ${registeredButNotDeclared.join(", ") || "none"}`
        );
    }
}
