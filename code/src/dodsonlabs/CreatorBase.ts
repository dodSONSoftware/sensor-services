/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import type * as express from "express";

// **** public classes

export abstract class RoutesCreatorBase {
    // ctor

    constructor(protected app: express.Application) {
        this.createRoutes();
    }

    // abstract functions

  protected abstract createRoutes(): void;
}
