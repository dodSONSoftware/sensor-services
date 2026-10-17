# Sensor Services — System Invariants

This document lists properties that must remain true after changes. Relevant tests and implementation modules are the enforcement points.

1. **Startup validation:** strict `configSchema` rejects unknown, missing or invalid settings before listener startup; values accepted by Zod must also be accepted by their downstream consumers (`schemas/configBoundary.test.ts`).
2. **Credential hygiene:** configuration/log payloads must be sanitized before logging; `db-password`, `loki-url` and recursively recognized secret keys must not leak through logs. Every log line passes a central two-tier redaction in the shared `Logger` (this service's own secret values by exact value; recognized sensitive keys by key/value pattern) before reaching any transport, with caller-side sanitization (`redactConfig`, `redactSecrets`, write-config metadata projection) retained as defense in depth. Raw configuration API reads are sensitive and must remain within trusted access controls.
3. **Middleware order:** request correlation and metrics execute before CORS/rate limiting; rate limiting precedes JSON body processing; `/health` and `/metrics` cannot be rate-limited.
4. **Request correlation:** `X-Request-ID` exists on handled requests and propagates to async request log context.
5. **Routes:** every route creator requires explicit `register()`; each live route must match module `__routes` and `__routesHelp` metadata on startup. Unmatched paths remain 404 and are logged at warn severity.
6. **MQTT correlation:** publish only with valid V3 envelopes; accept responses for the active `command_id` only. Each same-type command owns its slot and response snapshot; do not reuse results across callers.
7. **MQTT failure handling:** reject disconnected/unpublishable commands as 503 and always release claimed slots. Do not queue a QoS-0 command and claim it succeeded when the broker disconnected.
8. **Command timeout:** `command-silence-timeout-ms` cannot exceed 10 seconds; each HTTP command wait also has a hard 10-second cap.
9. **Sensor writes:** `/sensors/write-config/:source` must target a concrete sensor; reject literal/encoded/whitespace broadcast `*` before publishing. Broadcast reads and reboots remain supported.
10. **Config consistency:** `read-config` reflects validated disk state and `read-running-config` reflects current memory state. Writes replace the full document atomically and preserve the file's existing mode. Only log-level hot-reloads.
11. **Settings semantics:** PostgreSQL initialization only becomes available after full success. Without a pool, settings changes persist **in memory only** and report `X-Settings-Persisted: false`; after pool initialization, a failed write does **not** mutate the cache and reports an error.
12. **Settings updates:** unknown keys reject the entire patch (400); no partial mutation on schema error.
13. **Pinger analysis:** validate pinger config before analysis; unreachable/invalid pinger data degrades without mutating live sensor input. Validate target addresses to prevent outbound URL manipulation.
14. **Log access:** source, level and query limit are validated/bounded to avoid LogQL injection or excessive results.
15. **Health and shutdown:** dependency probes are bounded and concurrent; degraded health is not automatically HTTP 503. Shutdown is re-entrant safe and bounded to 15 seconds, closes resources in order and preserves success (signals) vs fatal (nonzero) exit semantics.
16. **Container lifecycle:** mounted YAML takes precedence over compiled fallback; runtime is non-root; Docker's 20-second stop grace exceeds the app's hard shutdown timeout.

Use `npm run blt` and scenario-specific tests before accepting changes to these guarantees. Some operational properties additionally require `tests/docker/verify.sh` and running services.
