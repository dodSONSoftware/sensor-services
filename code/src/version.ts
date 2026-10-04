/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

// Single source of truth for the application version and its release codename.
// The codename is a deterministic function of APP_VERSION: look up MAJOR in the
// Animal table and MINOR in the Material table, displayed as "<Material> <Animal>"
// (PATCH does not affect the name). Full scheme: .claude/commands/git-commit.md
// (RELEASE CODENAME SCHEME section). Keep package.json's version in sync with
// APP_VERSION — the /git-commit workflow does this on every version bump.
export const APP_VERSION = "4.11.2";
export const APP_NAME = "Cobalt Falcon";