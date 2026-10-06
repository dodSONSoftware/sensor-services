/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import express from "express";
import * as generalRoutes from "../../../src/routes/generalRoutes";
import * as sensorRoutes from "../../../src/routes/sensorRoutes";
import * as pingerRoutes from "../../../src/routes/pingerRoutes";
import * as settingsRoutes from "../../../src/routes/settingsRoutes";
import * as configRoutes from "../../../src/routes/configRoutes";
import * as logRoutes from "../../../src/routes/logRoutes";
import { CreateRouteNotFound } from "../../../src/routes/routeNotFound";
import { registeredRoutePaths, assertRoutesMatchDeclared } from "../../../src/routes/routeDrift";
import { createMockMqttNetworking } from "../../mocks/mqtt";

/**
 * P3-4 regression coverage.
 *
 * /sensors/ippinger-analyze is REGISTERED in pingerRoutes (createRoutes) but
 * its route metadata used to live in sensorRoutes. These tests pin the
 * corrected ownership and, more strongly, assert that the routes actually
 * registered on a real Express app equal the union of every module's declared
 * __routes — the invariant index.ts enforces at startup via
 * assertRoutesMatchDeclared().
 */
const ALL_DECLARED: Record<string, string[]> = {
    generalRoutes: generalRoutes.__routes,
    sensorRoutes: sensorRoutes.__routes,
    pingerRoutes: pingerRoutes.__routes,
    settingsRoutes: settingsRoutes.__routes,
    configRoutes: configRoutes.__routes,
    logRoutes: logRoutes.__routes,
};

// The full route surface, exactly as index.ts registers it (minus middleware
// and swagger, which do not create app.route() entries).
function buildFullApp(): express.Application {
    const app = express();
    app.use(express.json());
    const networking = createMockMqttNetworking();
    const general = new generalRoutes.CreateGeneralRoutes(app, networking);
    general.register();
    const sensors = new sensorRoutes.CreateSensorRoutes(app, networking);
    sensors.register();
    const pinger = new pingerRoutes.CreatePingerRoutes(app, networking, "http://127.0.0.1:3300", true, 10_000);
    pinger.register();
    const settings = new settingsRoutes.CreateSettingsRoutes(app);
    settings.register();
    const config = new configRoutes.CreateConfigRoutes(app);
    config.register();
    const log = new logRoutes.CreateLogRoutes(app);
    log.register();
    const notFound = new CreateRouteNotFound(app);
    notFound.register();
    return app;
}

function declaredUnion(): string[] {
    const union = new Set<string>();
    for (const routes of Object.values(ALL_DECLARED)) for (const r of routes) union.add(r);
    return [...union];
}

describe("route metadata ownership (P3-4)", () => {
    it("pingerRoutes owns the metadata for /sensors/ippinger-analyze", () => {
        expect(pingerRoutes.__routes).toContain("/sensors/ippinger-analyze");
        const help = (pingerRoutes.__routesHelp.commands as { route: string }[]).map((c) => c.route);
        expect(help).toContain("/sensors/ippinger-analyze");
    });

    it("sensorRoutes no longer carries /sensors/ippinger-analyze metadata", () => {
        expect(sensorRoutes.__routes).not.toContain("/sensors/ippinger-analyze");
        const help = (sensorRoutes.__routesHelp.commands as { route: string }[]).map((c) => c.route);
        expect(help).not.toContain("/sensors/ippinger-analyze");
    });

    it("each module's __routes is consistent with its __routesHelp", () => {
        const modules: { name: string; __routes: string[]; __routesHelp: Record<string, unknown> }[] = [
            { name: "generalRoutes", __routes: generalRoutes.__routes, __routesHelp: generalRoutes.__routesHelp },
            { name: "sensorRoutes", __routes: sensorRoutes.__routes, __routesHelp: sensorRoutes.__routesHelp },
            { name: "pingerRoutes", __routes: pingerRoutes.__routes, __routesHelp: pingerRoutes.__routesHelp },
            { name: "settingsRoutes", __routes: settingsRoutes.__routes, __routesHelp: settingsRoutes.__routesHelp },
            { name: "configRoutes", __routes: configRoutes.__routes, __routesHelp: configRoutes.__routesHelp },
            { name: "logRoutes", __routes: logRoutes.__routes, __routesHelp: logRoutes.__routesHelp },
        ];
        for (const mod of modules) {
            const help = ((mod.__routesHelp.commands as { route: string }[]) ?? []).map((c) => c.route);
            // Same set in both directions: no route without help, no help without a route.
            expect(mod.__routes).toEqual(expect.arrayContaining(help));
            expect(help).toEqual(expect.arrayContaining(mod.__routes));
        }
    });
});

describe("registered routes match declared metadata (P3-4)", () => {
    it("the set of registered routes equals the union of declared __routes", () => {
        const app = buildFullApp();

        const registered = registeredRoutePaths(app);
        expect([...registered].sort()).toEqual([...declaredUnion()].sort());

        // The exact production assertion passes (does not throw).
        expect(() => assertRoutesMatchDeclared(app, ALL_DECLARED)).not.toThrow();
    });

    it("registered routes include /sensors/ippinger-analyze (served by pingerRoutes)", () => {
        const app = buildFullApp();
        expect(registeredRoutePaths(app)).toContain("/sensors/ippinger-analyze");
    });
});

describe("routeDrift helpers", () => {
    it("registeredRoutePaths lists registered routes and excludes middleware", () => {
        const app = express();
        app.use((_req, _res, next) => next()); // middleware — must be excluded
        app.route("/a").get((_req, _res) => { }).post((_req, _res) => { }); // multi-method — appears once
        app.route("/b/:id").get((_req, _res) => { });
        expect(registeredRoutePaths(app).sort()).toEqual(["/a", "/b/:id"]);
    });

    it("assertRoutesMatchDeclared throws when a declared route is not registered", () => {
        const app = express();
        app.route("/a").get((_req, _res) => { });
        expect(() => assertRoutesMatchDeclared(app, { m: ["/a", "/ghost"] })).toThrow(/declared but not registered: \/ghost/);
    });

    it("assertRoutesMatchDeclared throws when a registered route is not declared", () => {
        const app = express();
        app.route("/a").get((_req, _res) => { });
        app.route("/undocumented").get((_req, _res) => { });
        expect(() => assertRoutesMatchDeclared(app, { m: ["/a"] })).toThrow(/registered but not declared: \/undocumented/);
    });

    it("assertRoutesMatchDeclared passes when registered and declared match exactly", () => {
        const app = express();
        app.route("/a").get((_req, _res) => { });
        app.route("/b").post((_req, _res) => { });
        expect(() => assertRoutesMatchDeclared(app, { m1: ["/a"], m2: ["/b"] })).not.toThrow();
    });
});
