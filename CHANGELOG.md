# Changelog

All notable changes to the sensor-services project are documented here. Versions are listed newest first.

## [4.14.7] — Silicon Falcon (2026-10-17)

- Documented the reverse-proxy caveat for the rate limiter in `CONFIGURATION.md`. The limiter keys each client by `req.ip` (the express-rate-limit default) and the service does not configure Express's trust-proxy setting: the current deployment exposes the container port directly, so every client has its own source address and its own `rate-limit-max` budget per window. A reverse proxy in front of the service would collapse all clients onto the proxy's source address and give the entire service a single shared budget, so trust proxy (and the limiter's client-key resolution, e.g. an `X-Forwarded-For`-based key) must be configured before one is introduced — or `rate-limit-max` raised to account for the shared addressing. Documentation-only change — no behavior change; the direct-port deployment is unaffected.

## [4.14.6] — Silicon Falcon (2026-10-17)

- Fixed the rate-limiter exemption for the observability endpoints so it holds for every routing of the path, not just the bare form. `/health` and `/metrics` were exempted by an exact `req.path` match, but Express's default (non-strict) routing also serves `/health/` and `/metrics/`, and the rate limiter reads `req.path` verbatim — so a scraper hitting the trailing-slash form was ratable and, once the limit was exhausted, would be 429'd. That could take the container into "unhealthy" (health) or drop Prometheus data (metrics) under load, defeating the documented invariant that these endpoints are never rate-limited. The exemption now matches the bare path plus an optional single trailing slash (`/health`, `/health/`, `/metrics`, `/metrics/`) and nothing else, so it cannot leak to a sibling route. Regression tests cover both trailing-slash routings.

## [4.14.5] — Silicon Falcon (2026-10-17)

- Stopped queue-waiter hard-cap timeouts from logging at error level. `mqtt_command_wait_for_command_completion` — used both by the active command and by queued waiters — logged "Command timed out after 10000ms hard cap" at error severity whenever the 10s hard cap tripped. A queued waiter (a second request of the same command type waiting for the in-flight one) hitting the cap is routine on a busy net: it simply loops and retries the slot claim, yet each retry window emitted a false error-level alert. The cap is now logged per caller: the active command's own wait (its command genuinely did not complete within the cap) still logs at error with the same message, while queue waiters log at debug, naming the command. Logging severity only — no change to command, slot, or response behavior.

## [4.14.4] — Silicon Falcon (2026-10-17)

- Corrected the Swagger server-URL auto-derivation, whose comment claimed it was "skipping loopback and Docker-internal addresses" while the code filters only loopback (`127.*`): under Docker the first non-loopback interface is the container's internal address, so with no `swagger-server-url` override the advertised `servers[0].url` points at an address host browsers cannot reach and the Swagger UI's "Try it out" requests fail. The comment, the `swagger-server-url` schema documentation, the `config.yml` example, `CONFIGURATION.md`, and a new `KNOWN_ISSUES.md` entry now state accurately that only loopback is skipped and that `swagger-server-url` should be set for container deployments. Documentation-only change — no behavior change; the spec content and the config-override contract are unchanged.

## [4.14.3] — Silicon Falcon (2026-10-17)

- Reworded the settings store's degraded-mode patch warning, which previously logged "[settingsStore] Patch attempted before init() — storing in memory only." on every settings save while PostgreSQL is down — misattributing the cause, since in the intended degraded startup path `init()` did run and simply found the database unavailable (the service continues by design with in-memory defaults). The message now states the actual condition: settings persistence is unavailable (no active pool) and the update was applied in memory only (non-durable, `X-Settings-Persisted: false`), so an operator is no longer pointed at a startup-ordering bug that doesn't exist while the real signal (database down) is buried. Logging hygiene only — no behavioral change.

## [4.14.2] — Silicon Falcon (2026-10-17)

- Fixed `mqtt_*` settings keys (`mqtt_broker_address`, `mqtt_topic_telemetry`, `mqtt_topic_command`, `mqtt_topic_command_response`) being accepted by `PATCH /ui/settings-update` and reported as persisted (`X-Settings-Persisted: true`) while the settings store silently dropped them: the store's known-key predicate validates against `DEFAULT_SETTINGS` membership, and those four keys were absent from it, so the update was skipped with no error — a false success that lost the caller's data. The keys now carry empty-string defaults (matching the `default: ""` already advertised by `GET /ui/settings-schema` and the documented `/ui/settings` contract), so updates apply and persist end-to-end, and `GET /ui/settings` includes them — which also activates the Angular settings page's pre-existing fields for these keys, previously filtered out because they were missing from the defaults response. The reference `database/schema.sql` seed was updated to stay identical to the app's self-seed. Regression tests cover the real store (patch + persistence round-trip), and a new cross-layer drift guard forces every key the update schema accepts to be a key the store can apply, so the two layers can no longer silently diverge.

## [4.14.1] — Silicon Falcon (2026-10-17)

- Made the graceful-shutdown HTTP step bounded so a slow in-flight request (or the Node 22 keep-alive idle drain that follows a response) can no longer consume the whole 15-second shutdown budget. Previously `closeHttpServer()` was a bare `server.close(cb)`, which only resolves once every connection is gone: an in-flight sensor command (up to the 10s command cap) plus the ~5s keep-alive drain could push the HTTP step past the 15s hard net on its own, so the safety net forced `process.exit(1)` and the MQTT, settings and logger cleanup was skipped — reporting a clean stop as a crash (exit 1) and dropping the final log flush. After a short grace (~4s) the server now calls `closeAllConnections()` to force-close in-flight and idle keep-alive connections, bounding the HTTP step so the remaining MQTT / settings / logger closes always get their time. In-flight HTTP requests are torn down after the grace instead of completing up to their own cap — acceptable at shutdown and consistent with the bounded-shutdown invariant. A new integration test sends SIGTERM with a request still in flight and asserts a clean exit 0 (it fails with exit 1 at the 15s net on the previous code).

## [4.14.0] — Silicon Falcon (2026-10-16)

- Added a central two-tier log redaction pass in the shared `Logger`: every log line now goes through a single auditable redaction before reaching any transport (console and Loki). The service's own secret values (`db-password`, `loki-url`) are masked by exact value, and recognized sensitive key/value pairs (`wifi-password`, `password`, `db-password`, `loki-url` in JSON-like form) are masked by key pattern — which also covers the previously unredacted untrusted forwarded-sensor-log path. Redaction used to be caller-driven at each log call site, so the INVARIANTS §2 credential-hygiene guarantee now holds structurally instead of resting on per-call-site discipline; existing caller-side redaction (`redactConfig`, `redactSecrets`, write-config metadata projection) is retained as defense in depth. Covered by 25 new tests, including a key-set drift guard and transport-capture integration tests.

## [4.13.16] — Graphite Falcon (2026-10-16)

- Hardened the settings store's key validation (defense in depth): `patchSettings` validated setting keys with prototype-chain membership (`in`), which accepts `__proto__`, `constructor`, and `prototype` as valid keys — writing one would rewrite the in-memory cache's prototype chain instead of a setting. Key validation now uses own-property membership (`Object.hasOwn`) and explicitly rejects the reserved keys in any dot-notation segment. The HTTP settings-update path was already safe end-to-end (global middleware strips these keys and the strict schema rejects unknown ones), so there is no externally visible behavior change — the guarantee now holds structurally in the settings layer instead of resting on middleware ordering alone. Regression tests pin the reserved-key rejection, including a prototype-pollution guard through `patchSettings` that fails against the old logic.

## [4.13.15] — Graphite Falcon (2026-10-16)

- Aligned the reference database schema (`database/schema.sql`) with the app's own settings defaults: its seeded telemetry display-mapping keys were stale kebab-case (`temperature-c`) while the app's defaults and the live sensor telemetry use snake_case (`temperature_c`), so an operator who ran the reference schema before first app start would have gotten display keys that never matched live sensor data. The seed row now matches `DEFAULT_SETTINGS` exactly, and a new regression test parses the SQL seed and fails CI on any future drift.
- Note for existing installs that were initialized from the old `schema.sql`: the persisted row still carries kebab-case telemetry keys and must be re-set through the settings UI/API (the app will not migrate them in place).

## [4.13.14] — Graphite Falcon (2026-10-16)

- Removed the dead `getSettingsDefaults` handler from the settings controller: it was unit-tested but bound to no route (absent from `__routes`, `__routesHelp`, and `/endpoints`), so its test suite gave a false signal that a `GET /settings/defaults` endpoint existed. No HTTP behavior changes — the handler was unreachable in production.

## [4.13.13] — Graphite Falcon (2026-10-16)

- Removed the stale `/ippinger/*` proxy-route documentation from the README and architecture docs — the only pinger endpoint this service exposes is `GET /sensors/ippinger-analyze`, and the docs no longer point operators at routes that return 404.
- Added a detailed documentation set under `docs/` (architecture, configuration, engineering decisions, system invariants, known issues, testing) and condensed CLAUDE.md into a compact agent-instructions page that points to it.
