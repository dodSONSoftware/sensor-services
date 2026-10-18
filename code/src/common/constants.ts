/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

/**
 * Absolute hard cap (ms) for a single HTTP MQTT command: the wait in
 * sensorController is force-terminated at this value no matter how long
 * command silence keeps it alive. The config schema rejects
 * command-silence-timeout-ms values above it, since a silence timeout
 * beyond the cap can never be honored. Both references MUST go through
 * this constant (it used to be two inlined 10_000 values kept in sync by
 * comment). This module is a leaf (no imports) so both schemas/ and
 * controllers/ can import it without a dependency cycle.
 */
export const HTTP_COMMAND_HARD_CAP_MS = 10_000;
