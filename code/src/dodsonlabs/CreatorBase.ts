/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import type * as express from "express";

// **** public classes

export abstract class RoutesCreatorBase {
    // ctor
    //
    // Deliberately does NOT call createRoutes(): a base constructor calling an
    // overridden method is virtual dispatch before the derived constructor has
    // initialized its own fields, which is a fragile pattern. Call register()
    // explicitly after construction instead:
    //
    //   const routes = new CreateSensorRoutes(app, networking);
    //   routes.register();

    constructor(protected app: express.Application) {
    }

    // **** public functions

    /** Registers this creator's routes/middleware on the app. Call once, after construction. */
    public register(): void {
        this.createRoutes();
    }

    // abstract functions

  protected abstract createRoutes(): void;
}
