# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Directory Organization

/home/worker/Documents/code/sensor-services/sensor-services/
├── README.md              -- Project identification (minimal)
├── LICENSE                -- MIT License with Patent Grant
├── .gitignore
├── .claude/               -- Claude Code config (skills, commands, memory, settings)
│   ├── commands/
│   │   ├── blt.md         -- /build-lint-test quality gate definition
│   │   └── git-commit.md  -- /git-commit semantic versioning workflow
│   └── skills/
│       └── blt/           -- BLT skill driver (analyze → build → lint → test)
└── code/                  -- Application source (all development happens here)
    ├── package.json       -- Dependencies, scripts, Volta config (Node 22.22.0, version 4.12.27)
    ├── tsconfig.json      -- ES2022, NodeNext, strict mode, noUnusedLocals/Parameters, outDir: dist
    ├── jest.config.ts     -- Jest config (ts-jest preset, node environment, 70% coverage threshold)
    ├── jest.setup.ts      -- Test setup (suppresses console output)
    ├── Dockerfile         -- Two-stage build (Node 22): builder runs the canonical `npm run build` (P3-8); final image gets dist/, only the src/routes subset for Swagger, non-root user, /health healthcheck, exposes port 32000
    ├── docker-compose.yml -- Docker Compose: build + run with configs dir mount (/app/configs/), restart: unless-stopped
    ├── nodemon.json       -- Dev watch config
    ├── eslint.config.mjs  -- ESLint 9.x flat config (@typescript-eslint v8), excludes tests/, dodsonlabs/, jest config files, coverage/
    ├── .vscode/           -- VS Code workspace settings
    │   ├── extensions.json    -- Recommended extensions (eslint)
    │   └── settings.json      -- Workspace settings (ESLint validation, code actions on save)
    ├── .dockerignore      -- Docker build exclusions (node_modules, tests, coverage, etc.)
    ├── .editorconfig      -- Editor config (indentation, charset, line endings)
    ├── src/
    │   ├── index.ts       -- Entry point: config load, Zod validation, logger init, MQTT init, Swagger, middleware, API metrics, routes, listen, graceful shutdown (15s hard timeout, re-entrancy guard, exits after runGracefulShutdown)
    │   ├── version.ts     -- App version source of truth: APP_VERSION + APP_NAME (release codename, derived per the codename scheme in .claude/commands/git-commit.md); package.json version kept in sync
    │   ├── config.yml     -- Runtime configuration (MQTT broker, topics, ports, rate limiting, YAML format); holds NO real secrets — credentials live in config-secrets.yml
    │   ├── config-secrets.example.yml -- Tracked TEMPLATE for config-secrets.yml (placeholders only); copy to config-secrets.yml and fill in real values
    │   ├── swagger.ts     -- Swagger UI setup at /swagger (auto-derived from routable IP + port, overridable via config `swagger-server-url`)
    │   ├── common/
    │   │   ├── global.ts  -- Global logger singleton, AsyncLocalStorage request ID propagation, aboutDude() metadata (system_info now populated)
    │   │   ├── metrics.ts -- API Prometheus metrics: http_requests_total (Counter), http_request_duration_seconds (Histogram), http_errors_total (Counter) — separate registry from sensor gauges
    │   │   ├── shutdown.ts -- runGracefulShutdown(): closes HTTP server, MQTT client, settings store; emits final shutdown log; closes the active logger exactly once (buffered transports flush); process exit owned by caller. formatFatalError() (Optional-1): normalizes arbitrary thrown/rejected values through ensureError() for the fatal handlers — non-Error values never log as "undefined"; stacks are kept only for genuine Error inputs
    │   │   └── app-request.d.ts -- Express Request augmentation with optional id field
    │   ├── controllers/
    │   │   ├── generalController.ts  -- /about, /date_local, /date_utc, /health (includes memory/CPU/uptime, cpu.load)
    │   │   ├── sensorController.ts   -- MQTT-based sensor command handlers (event-based completion via waitForCompletion + AbortController, 10s hard cap, per-type slot serialization via claim(), each request publishes its own command)
    │   │   ├── pingerController.ts   -- IP Pinger proxy + analyze logic (async/await, graceful degradation, validateIpAddress() rejects private/reserved IPs, fetchWithTimeout() via AbortSignal.timeout())
    │   │   ├── logController.ts      -- GET /sensors/logs/:source (Loki queries; source allowlist-validated against LogQL injection, level allowlist, fetch timeout via AbortSignal; loki-url is never logged verbatim — it may embed credentials)
    │   │   └── settingsController.ts -- GET /ui/settings, GET /ui/settings-schema, PATCH /ui/settings-update (strict unknown-key rejection → 400, X-Settings-Persisted header on success)
    │   ├── middleware/
    │   │   └── middleware.ts -- Global middleware in deliberate order (P3-2): request ID -> HTTP metrics (optional, passed in) -> CORS (restricted to cors-allowed-origins, P3-5) -> rate limiting (default 100 req/15min) -> JSON parser (configurable body limit) -> request logger -> body validation (Zod)
    │   ├── routes/
    │   │   ├── generalRoutes.ts   -- /about, /date-local, /date-utc, /health, /metrics (dash-variant aliases for date routes)
    │   │   ├── sensorRoutes.ts    -- /sensors/* (MQTT command routes)
    │   │   ├── pingerRoutes.ts    -- /sensors/ippinger-analyze (analysis endpoint; owns its __routes/__routesHelp metadata, P3-4)
    │   │   ├── settingsRoutes.ts  -- /ui/settings, /ui/settings-schema, /ui/settings-update (PostgreSQL persistence via settingsStore)
    │   │   ├── logRoutes.ts       -- /sensors/logs/:source (Loki log queries)
    │   │   ├── routeDrift.ts      -- registeredRoutePaths() + assertRoutesMatchDeclared(): validate declared __routes against the live Express app (P3-4)
    │   │   └── routeNotFound.ts   -- 404 handler (wired into app); logs unmatched routes at warn, not error (P3-3)
    │   ├── schemas/
    │   │   ├── config.ts        -- Zod v4 schemas for config.yml validation (log-level: error/info/debug/warn); redactConfig() masks db-password/loki-url
    │   │   ├── configLoader.ts  -- readConfigWithSecrets(): read base config.yml + merge optional sibling config-secrets.yml (override) -> unvalidated merged config
    │   │   ├── postBody.ts      -- Zod schemas for POST body validation
    │   │   └── settings.ts      -- Zod schemas + defaults + metadata for application settings (UI preferences + server connection details)
    │   ├── services/
    │   │   └── settingsStore.ts -- PostgreSQL-backed persistence for application settings (init, getSettings, patchSettings, isPersistenceAvailable)
    │   └── dodsonlabs/          -- Shared library (git clone from dodson-labs-core)
    │       ├── CreatorBase.ts       -- Abstract RoutesCreatorBase for route creators
    │       ├── Interfaces.ts        -- IAbout, ILogger, IMqttCommandControl, IMqttNetworking, LogLevel
    │       ├── HttpConstants.ts     -- HTTP status codes and MIME types
    │       ├── Logger.ts            -- Console logger with Error/Warn/Info/Debug levels, requestId in output; Loki transport runs with gracefulShutdown: false so no logging library hook can terminate the process — the app closes the transport via a bounded closeLokiTransportBounded() (flush → batcher.close, 5s cap)
    │       ├── SystemFunctions.ts   -- File I/O, sleep, timestamps, bash exec, error helpers; redactSecrets() shared recursive secret masking (SENSITIVE_SECRET_KEYS at any depth, no input mutation)
    │       ├── MqttNetworking.ts    -- MQTT client, command-response tracker (drops messages on untracked topics; telemetry handling moved to sensor-telemetry-service); outbound publish logs are sanitized — write-config logs metadata only, all other commands are redacted via redactSecrets(), the published message is never mutated
    │       ├── MqttCommandControl.ts -- Timeout-based state machine for command-response pairs (atomic claim() slot serialization, last_sent_at)
    │       └── version.txt          -- Library version (1.2.8)
    ├── tests/
    │   ├── mocks/
    │   │   ├── express.ts   -- createMockRes(), createMockReq() helpers
    │   │   └── mqtt.ts      -- createMockMqttNetworking() helper (mockCommandControl with claim() slot serialization and an immediately-resolving waitForCompletion; mirrors only the real MqttNetworking surface — P3-10)
    │   ├── docker/
    │   │   └── verify.sh    -- P3-8 Docker e2e regression (needs Docker daemon): image builds, starts with a mounted config (and refuses without one), no secret file in the image, Swagger initializes
    │   └── __tests__/
    │       ├── swagger.test.ts  -- setupSwagger(): served spec contains real route paths (not the stale empty doc), including /api/reload-config, /api/write-config, and /ui/settings-update (guards against a JSDoc YAML error silently dropping a block)
    │       ├── exitCodes.test.ts -- P2-2 integration: spawns dist/index.js and asserts exit codes (SIGTERM/SIGINT→0, invalid config→1, EADDRINUSE→1); skipped if dist/ is not built
    │       ├── common/
    │       │   ├── global.test.ts -- AsyncLocalStorage request ID tests, createLogger(), setReqIdStore()
    │       │   ├── metrics.test.ts -- API metrics middleware: unmatched routes collapse to the "unmatched" label sentinel
    │       │   └── shutdown.test.ts -- runGracefulShutdown(): resource close order, final log before close, logger close exactly once
    │       ├── controllers/
    │       │   ├── configController.test.ts   -- diffConfigReload(), reload-config/write-config restart_required reporting, readConfig() secret masking
    │       │   ├── generalController.test.ts  -- /about, /date_local, /date_utc, /health
    │       │   ├── logController.test.ts      -- /sensors/logs/:source: LogQL injection guard (400), level allowlist, AbortSignal wiring, loki-url never logged verbatim (credential in URL never appears in emitted logs), limit default 50 / clamp 100 / invalid→default, response sliced to limit, end-time: valid ISO → 2h pagination window, unparseable → current time + 1h window (Optional-5)
    │       │   ├── sensorController.test.ts   -- create_mqtt_command_message(), get_it/post_it error paths, already-running (waiter publishes own command), concurrency (real MqttCommandControl), hard timeout
    │       │   ├── pingerController.test.ts   -- analyzeIt(), createAnalyzeResult(), fetchItOnly non-OK responses, getAnalyzeIpPinger degradation on malformed upstream bodies (Zod-validated), camelCase ipAddress normalization
    │       │   └── settingsController.test.ts -- getAllSettings, getSettingsScheme, updateSettings + X-Settings-Persisted header true/false (degraded mode still applies in-memory), strict update schema: unknown key → 400, known+unknown → 400, nested telemetry key accepted (P3-6, P3-7), persistence-layer failure → 500 with reason and nothing applied (Optional-5)
    │       ├── middleware/
    │       │   └── middleware.test.ts   -- global body-validation pipeline via real CreateMiddleware + supertest (bodyless GETs reach handlers, array body → 400, body-requiring routes own their 400) + direct _validateBodyMiddleware tests (missing body passes through) + rate-limit exemption for /health and /metrics (P2-4) + middleware ordering: 429 carries X-Request-ID, 429 counted by metrics, Swagger passes through the pipeline, rate limiting precedes the JSON parser (P3-2) + CORS origin restriction: allowed/unknown/no-origin, preflight for mutating endpoint, secure default when unset (P3-5)
    │       ├── routes/
    │       │   ├── configRoutes.test.ts       -- /api/reload-config, /api/read-config, /api/write-config via supertest
    │       │   ├── generalRoutes.test.ts      -- Integration tests via supertest
    │       │   ├── sensorRoutes.test.ts       -- All /sensors/* routes via supertest (identify→404, get-details, reboot, read-config, write-config, update-config→501) + POST body validation through the REAL CreateMiddleware stack (P3-9): own `constructor`/`prototype` key → 400, normal object → 200
    │       │   ├── pingerRoutes.test.ts       -- /sensors/ippinger-analyze via supertest (degraded warning when pinger unreachable, analysis when reachable)
    │       │   ├── routeDrift.test.ts         -- P3-4: pingerRoutes owns /sensors/ippinger-analyze metadata, per-module __routes↔__routesHelp consistency, registered routes == union of declared __routes, routeDrift helper unit tests
    │       │   ├── settingsRoutes.test.ts     -- GET /settings, GET /settings/schema, PATCH /settings/update via supertest + X-Settings-Persisted header, unknown key → 400 (P3-6, P3-7)
    │       │   └── routeNotFound.test.ts      -- 404 handler tests (including uninitialized logger) + unmatched routes log at warn, never error (P3-3)
    │       ├── schemas/
    │       │   ├── config.test.ts     -- Zod v4 config schema validation tests (incl. cors-allowed-origins origin validation: well-formed accepted, path/credentials/non-http/bare-host/non-array/non-string rejected, P3-5; missing required key rejected, Optional-5; ippinger-fetch-timeout-ms rename: new key accepted/validated, old fetch-timeout-ms still accepted as deprecated alias, resolveIppingerFetchTimeoutMs precedence — new key wins, Optional-2)
    │       │   ├── configLoader.test.ts -- readConfigWithSecrets(): merge/override, absent/empty/corrupt secrets, missing-required-secret fails validation
    │       │   └── postBody.test.ts   -- Zod POST body schema tests
    │       ├── services/
    │       │   ├── settingsStore.test.ts     -- validateSettingsFromDb: nested/legacy key resolution, migrations, schema validation
    │       │   └── settingsStoreInit.test.ts -- init(): seeding, corrupt-row repair (UPSERT), bootstrap pool cleanup
    │       ├── dodsonlabs/
    │           ├── Logger.test.ts               -- Loki shutdown ownership: transport constructed with gracefulShutdown:false, bounded flush/close on logger close (mocked winston-loki, no real HTTP/DNS)
    │           ├── MqttCommandControl.test.ts -- State machine tests (fake timers), claim() slot serialization
    │           ├── MqttNetworking.test.ts     -- MQTT networking tests (dedup, latency, telemetry validation, untracked-topic drop, outbound publish secret redaction, close() timeout clearing: graceful-wins vs timeout-wins, uptime_ms truncation contract pinned — "upTIME" matches the time/millis truncation pattern, Optional-3). Tests construct real mqtt clients against 127.0.0.1 (no external DNS/network); a registry force-closes any client a test orphans by swapping in a mock, so no reconnect timer fires into jest teardown (Optional-4)
    │           ├── PrometheusWriter.test.ts   -- PrometheusWriter tests (source sanitization, range checks)
    │           └── SystemFunctions.test.ts    -- ensureError(), formatElapsedTime(), log level converters, redactSecrets()
    │       └── docker/
    │           └── docker.test.ts     -- P3-8 static Dockerfile/.dockerignore guards: canonical `npm run build`, no config-secrets copy, src/routes subset only, CWD-relative fallback resolution, secrets excluded from build context
    └── dist/              -- Compiled output (tsc)

## Commands

All commands run from the `code/` directory.

```bash
npm run build          # Install deps, compile TypeScript, copy config.yml to dist/
npm start              # Run compiled app: node ./dist/index.js
npm run dev            # Hot-reload dev: nodemon --exec ts-node src/index.ts
npm run lint           # ESLint 9.x check (eslint.config.mjs, @typescript-eslint v8)
npm run lint:fix       # ESLint auto-fix
npm test               # Jest test runner
npm run test:watch     # Jest watch mode
npm run test:coverage  # Jest with coverage report
npm run blt            # CI check: build + lint + test with coverage (`npm run build && npm run lint && npm run test:coverage`, exit 1 if any step fails or coverage < 70%)

### Docker

```bash
docker compose up --build   # Build image + run container (config.yml mounted from /mnt/sensor-services/config.yml)
docker compose down         # Stop and remove container
bash tests/docker/verify.sh # P3-8 regression: image builds, app starts via the documented config strategy, no secret file in the image, Swagger initializes
```

**docker-compose.yml** (in `code/`) mounts a host `config.yml` into the container at `/app/configs/config.yml`. The container exposes port 32000 (API). Healthcheck probes `/health` every 30s (`timeout: 5s`, `retries: 3`, `start-period: 10s`). Container restarts automatically with `restart: unless-stopped`.

**Docker configuration strategy (P3-8):** the container reads config exactly like bare metal — `/app/configs/config.yml` first (the docker-compose mount point), then the CWD-relative fallback `./dist/config.yml`. The final image's WORKDIR is `/app`, so the fallback resolves to `/app/dist/config.yml` — the same secret-free default that bare metal resolves (`code/dist/config.yml`), keeping the two startup paths consistent. The committed `config.yml` is intentionally secret-free: it carries no `db-password` (a required secret), so the built-in default is NOT a standalone working config. Real credentials always come from outside the repo — on bare metal via a gitignored sibling `config-secrets.yml` (the build copies it next to `config.yml`), and in Docker via a **mounted config** (docker-compose mounts the host configs dir at `/app/configs/`; an optional sibling `config-secrets.yml` there is merged in at startup). A container with no mounted config therefore exits at startup (missing `db-password`) rather than partially starting — that is the intended, documented behavior, and it is what `tests/docker/verify.sh` pins. `config-secrets.yml` never enters the image (excluded by `.dockerignore` AND explicitly removed after the build in the builder stage).

### Notes

- Jest configured via `jest.config.ts` (ts-jest preset, node environment, 70% coverage threshold). Excludes `src/dodsonlabs/**/*.ts` and `src/index.ts` from coverage.
- ESLint 9.x configured via `eslint.config.mjs` with `@typescript-eslint` v8. Excludes `tests/`, `src/dodsonlabs/`, `jest.config.ts`, `jest.setup.ts`.
- No CI/CD pipeline exists.
- Uses Volta to pin Node 22.22.0 / npm 10.9.4.
- `dodsonlabs/` is excluded from ESLint and test coverage (shared library, not a git submodule).
- `tsconfig.json` uses `module: "NodeNext"`, `noUnusedLocals: true`, `noUnusedParameters: true`. Excludes `coverage/` to prevent leaked test artifacts from blocking builds.
- Dockerfile runs as non-root user (`appuser`), includes HEALTHCHECK on `/health`; the builder stage runs the canonical `npm run build` (P3-8) rather than re-implementing its steps.

## Architecture

### Overview

This is an Express REST API that bridges IoT weather sensors to HTTP clients and Prometheus. It runs a single HTTP server:

1. **Main Express app** on port 32000 (configurable via `express-port` in config) — serves REST API + Swagger UI + API metrics at `/metrics`
2. **Prometheus metrics server** on port 3301 (configurable via `prometheus-port` in config) — exposes `/metrics` with 10 sensor gauges

The app connects to an MQTT broker for real-time sensor telemetry ingestion and command-response communication.

### Startup Flow (`src/index.ts`)

1. Read config from `/app/configs/config.yml` (falls back to `./dist/config.yml`) via `readConfigWithSecrets()` — merges the base file with an optional sibling `config-secrets.yml` (credentials), then validates the merged result
2. Validate config with Zod v4: required keys (`mqtt-broker-ip-address`, `mqtt-topic-telemetry`, `mqtt-topic-command`, `mqtt-topic-command-response`, `ip-pinger-web-api`, `express-port`, `prometheus-port`, `case-sensitive`, `log-level`), MQTT topic strings must be non-empty, ports must be positive integers, `case-sensitive` must be boolean, `log-level` must be one of `error`/`warn`/`info`/`debug`. Optional keys: `swagger-server-url`, `loki-url`, `loki-enabled`, `forward-sensor-logs`, `forward-sensor-logs-level`, `express-body-limit`, `rate-limit-window-ms`, `rate-limit-max`, `sensor-source-max-length`, `sensor-source-valid-chars-regex`, `ippinger-fetch-timeout-ms` (deprecated alias: `fetch-timeout-ms`), `command-silence-timeout-ms`
3. Create global `Logger` instance via `createLogger(config)` — Winston-backed with `error`/`warn`/`info`/`debug` levels, optional Loki transport
4. Create `MqttNetworking` instance (connects to MQTT broker, subscribes to command-response topic)
5. Get port from config `express-port`
6. Initialize settings persistence (`settingsStore.init()`) — connects to PostgreSQL, creates DB/table if needed, seeds defaults (graceful degradation to in-memory defaults on failure)
7. Create middleware in the P3-2 order (request ID → HTTP metrics → CORS → rate limiting → JSON parsing → request logger → body validation). The API metrics middleware is passed into `CreateMiddleware` so it is installed AHEAD of the rate limiter (that is what makes 429s carry an X-Request-ID and be counted); it tracks request duration/status/errors using a separate prom-client registry
8. Setup Swagger at `/swagger` (auto-derived from routable IP + port, overridable via config `swagger-server-url`) — mounted AFTER the global middleware so it does not bypass the request-ID / metrics / CORS / rate-limit / body-validation pipeline (P3-2)
9. Register route groups: `generalRoutes`, `sensorRoutes`, `pingerRoutes`, `settingsRoutes`, `configRoutes`, `logRoutes`, `routeNotFound`
10. Drift detection: per-module, `validateRoutesHelp()` checks each `__routes` array matches its `__routesHelp`; then `assertRoutesMatchDeclared()` (routeDrift.ts, P3-4) checks the union of all declared `__routes` equals the routes actually registered on the live Express app — a route registered but never declared, or declared but never registered, fails startup
11. Listen on configured port
12. Register `uncaughtException`/`unhandledRejection` handlers — call `shutdown()` to trigger graceful shutdown
13. Register graceful shutdown handlers for `SIGTERM`/`SIGINT` — 15s hard timeout safety net, re-entrancy guard; `runGracefulShutdown()` (common/shutdown.ts) closes HTTP server → MQTT client → settings store → final log → active logger (exactly once), then the caller exits with the signal's exit code (0 for SIGINT/SIGTERM; 1 for uncaughtException/unhandledRejection)

### Core Components

**MqttNetworking** (`dodsonlabs/MqttNetworking.ts`) — The central sensor networking class:
- Connects to MQTT broker with auto-reconnect (5s reconnectPeriod, 10s connectTimeout)
- Subscribes to the command-response topic (`iot/v3/command-response`), the V3 info-request topic (`iot/v3/info-request`, for sensor UTC-time queries), and — when `forward-sensor-logs` is enabled — the sensor log topic (`mqtt-topic-log`, default `iot/v3/log`). Telemetry is handled by sensor-telemetry-service.
- Command responses tracked via `MqttCommandControl` state machines (configurable `command-silence-timeout-ms`, default 1500ms)
- Outbound command deduplication via `seen_command_ids` map (TTL-based eviction, max size cap)
- Sensor log forwarding via `handle_mqtt_message_log()` — controlled by `forward-sensor-logs` (on/off) and `forward-sensor-logs-level` (minimum level) config keys
- Exposes `publish_mqtt_message()` for sending commands to sensors — throws on failure (caller must handle)
- Exposes `register_command_id()` for deduplication

**SettingsStore** (`services/settingsStore.ts`) — PostgreSQL-backed persistence for application settings:
- Connects to PostgreSQL database, creates target DB/table if needed, seeds defaults on first run
- `init()` builds the pool in a local variable and only assigns module-level `pool` after full success — `pool !== null` means persistence is initialized and usable. On failure the client is released, the pool is closed, `pool` stays null, and the service runs in real writable in-memory mode
- `getSettings()` returns deep clone; `patchSettings(updates)` merges partial updates and persists to DB; `isPersistenceAvailable()` reports `pool !== null` so the settings controller can report the persistence state of each update (P3-6)
- Updates are serialized in-process via a promise queue: concurrent PATCHes each observe the latest committed state (no lost updates), and a failed update rethrows to its own caller without blocking subsequent ones
- Graceful degradation: DB unavailability falls back to in-memory defaults without crashing
- Exposed via three routes: `GET /ui/settings`, `GET /ui/settings-schema`, `PATCH /ui/settings-update`

**MqttCommandControl** (`dodsonlabs/MqttCommandControl.ts`) — Timeout-based state machine:
- Tracks async MQTT command-response pairs
- Default timeout: 1500ms (configurable via `command-silence-timeout-ms`)
- Event-based completion via `waitForCompletion()` (replaces old 1-second polling loop)
- 10-second hard safety cap via `AbortController` to prevent infinite hangs
- `claim()` — atomic synchronous check-and-set slot claim; the controller serializes same-type commands with it, so each HTTP request publishes its own command and responds with its own results (never a concurrent caller's)
- `active_command_id` — `initialize(commandId)` records the active request's `command_id`; `MqttNetworking` accepts command responses only when the response's `command_id` matches it (one active id may receive responses from multiple sensors). Stale responses from a previous command are dropped at debug level and never restart the silence timer

**RoutesCreatorBase** (`dodsonlabs/CreatorBase.ts`) — Abstract base class:
- All route modules extend this: `CreateGeneralRoutes`, `CreateSensorRoutes`, `CreatePingerRoutes`, `CreateSettingsRoutes`
- Constructor calls abstract `createRoutes()` method

**API Metrics** (`common/metrics.ts`) — Separate Prometheus registry for API-level observability:
- `http_requests_total` (Counter) — labeled by method, route, status code
- `http_request_duration_seconds` (Histogram) — labeled by method, route, buckets: 0.01–10s
- `http_errors_total` (Counter) — labeled by method, route (counts 5xx)
- Exposed at `/metrics` on the main Express app (port 32000)






**Sensor Commands (HTTP → MQTT → Response):**
```
HTTP GET /sensors/get-details → sensorController → mqtt_command_get_messages()
  → MqttNetworking.publish_mqtt_message(topic: iot/v3/command, msg)
  → Sensor processes command, responds on iot/v3/command-response
  → MqttNetworking.handle_mqtt_message_command_response() → MqttCommandControl.results[]
  → Event-based wait: MqttCommandControl.waitForCompletion() with 10s hard cap
  → HTTP response returns MqttCommandControl.results
```

**IP Pinger Proxy (HTTP → External Service):**
```
HTTP GET /ippinger/ping → pingerController.fetchIt() → fetch() → http://<ip>:<port>/ping → response
```

**IP Pinger Analysis (HTTP → MQTT + HTTP → Merge):**
```
HTTP GET /sensors/ippinger-analyze → getAnalyzeIpPinger()
  → mqtt_command_get_messages(network, "*", "get-details")  [fetch live sensors via MQTT]
  → fetchItOnly("http://<ip>:<port>/read-config")       [fetch pinger config via HTTP]
  → analyzeIt(sensors, ippinger_devices, case_sensitive)  [compare and classify]
  → Results: "OK", "IP Address Mismatch", "Name Mismatch", "Offline", "New"
  → Graceful degradation: if pinger unreachable, returns live sensors with warning
```

**API Metrics (middleware → /metrics):**
```
HTTP request → middleware (request ID, rate limit, body validation)
  → API metrics middleware (wraps res.end, captures status/duration)
  → route handler
  → http_requests_total.inc(), httpRequestDuration.observe(), httpErrorsTotal.inc()
  → GET /metrics → apiMetricsRegistry.metrics()
```

  → GET /metrics → apiMetricsRegistry.metrics()

## API Endpoints

### Settings Routes (`/ui/settings`) — PostgreSQL persistence

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/ui/settings` | All application settings (merged from DB + defaults) |
| GET | `/ui/settings-schema` | Setting definitions with name, default, range, and description for dynamic form generation |
| PATCH | `/ui/settings-update` | Partial update — only fields in body are changed; unknown keys are rejected with 400 (strict schema); persists to DB, returns merged result with `X-Settings-Persisted` header (`true` = PostgreSQL, `false` = in-memory degraded mode) |

### Configuration Routes (`/api/*`)

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/reload-config` | Reloads configuration from disk; only `log-level` applies immediately, other changed keys are reported in `restart_keys` (Loki settings require a restart — hot-reload disabled to prevent live log exfil) |
| GET | `/api/read-config` | Returns the running (in-memory) configuration as JSON — no disk reload side effects; `db-password` and `loki-url` are masked |
| POST | `/api/write-config` | Saves new configuration and reloads; only `log-level` applies immediately, other changed keys require a restart |

### General Routes (no prefix)

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/about` | API metadata, version, commands list, system info |
| GET | `/date_local`, `/date-local` | Current local date/time (`yyyy-mm-ddThh:mm:ss`) |
| GET | `/date_utc`, `/date-utc` | Current UTC date/time (`yyyy-mm-ddThh:mm:ssZ`) |
| GET | `/endpoints` | Detailed information about each API endpoint |
| GET | `/health` | Health status with MQTT, memory, CPU, uptime — HTTP 200 for healthy/degraded, HTTP 503 for unhealthy |
| GET | `/metrics` | Prometheus scrape endpoint for API metrics (requests, duration, errors) |

### Sensor Routes (`/sensors`) — MQTT-based

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/sensors/get-details` | Get details for all sensors |
| GET | `/sensors/get-details/:source` | Get details for a specific sensor |
| POST | `/sensors/reboot` | Reboot all sensors via MQTT (firmware resets ~5s after responding). POST is canonical; GET is accepted during the compatibility period |
| POST | `/sensors/reboot/:source` | Reboot a specific sensor. POST is canonical; GET is accepted during the compatibility period |
| GET | `/sensors/read-config` | Read config from all sensors |
| GET | `/sensors/read-config/:source` | Read config from a specific sensor |
| POST | `/sensors/write-config/:source` | Write the complete config to a specific sensor (MQTT command). Rejects the broadcast target `*` (and `%2A`, whitespace variants) with 400 — no MQTT publish |
| POST | `/sensors/update-config/:source` | Deprecated — returns 501; firmware v4 has no partial update, use write-config |
| GET | `/sensors/logs/:source` | Fetch sensor logs from Loki; `:source` is allowlist-validated (LogQL injection guard), optional `level` (debug/info/warn/error) and `limit` (max 100) query params |

### IP Pinger Routes (`/ippinger`) — Proxy to external service

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/ippinger/about` | Proxy to IP pinger service `/about` |
| GET | `/ippinger/read-config` | Proxy to IP pinger service `/read-config` |
| POST | `/ippinger/write-config` | POST to IP pinger service `/write-config` |
| POST | `/ippinger/restart` | POST to IP pinger service `/restart` |
| GET | `/ippinger/ping` | Proxy to IP pinger service `/ping` |
| GET | `/ippinger/ping/:target` | Proxy to IP pinger service `/ping/{ip}` |

### Sensor Routes (`/sensors`) — Analysis

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/sensors/ippinger-analyze` | Compare pinger config against live sensors |

### Prometheus Metrics (port 3301)

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/metrics` | Prometheus scrape endpoint (10 sensor gauges) |

### API Metrics (port 32000)

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/metrics` | Prometheus scrape endpoint (API request counters, duration histogram, error counters) |

### Swagger

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/swagger` | Swagger UI (OpenAPI 3.0, scans `src/routes/**/*.ts` for JSDoc) |

## Configuration

**File:** `code/src/config.yml`

**Secrets split (P1-4):** credentials are NOT stored in the tracked `config.yml`. They live in a **gitignored** `config-secrets.yml` (sibling of `config.yml`), which overrides the same keys in the base file at load time. The tracked `config-secrets.example.yml` is the template (placeholders only). Load order: base `config.yml` → optional `config-secrets.yml` (override) → validate the **merged** result against the full Zod schema. A missing required secret (e.g. `db-password`) fails validation at startup with a clear error. `config-secrets.yml` is gitignored and excluded from the Docker build context (`.dockerignore`), so no real secret is ever committed or baked into the image. For Docker, place `config-secrets.yml` in the mounted `/app/configs/` dir alongside `config.yml`.

```yaml
# Main HTTP server port
express-port: 32000

# Logging (error, warn, info, debug)
log-level: debug

# Optional: Loki structured logging
# loki-url: "http://10.10.10.60:3100"
# loki-enabled: true

# Prometheus metrics server port
prometheus-port: 3301

# MQTT broker connection
mqtt-broker-ip-address: "10.10.10.64"
mqtt-topic-telemetry: "iot/v3/telemetry"
mqtt-topic-command: "iot/v3/command"
mqtt-topic-command-response: "iot/v3/command-response"

# External services
ip-pinger-web-api: "http://10.10.10.64:3300"

# Behavior
case-sensitive: true

# Optional: override auto-derived Swagger server URL
# swagger-server-url: "http://10.10.10.217:32000/"

# Optional: sensor application log topic (default: iot/v3/log)
# mqtt-topic-log: "iot/v3/log"

# Optional: disable forwarding of sensor application logs to the app logger (default: true)
# forward-sensor-logs: false
# Minimum log level for forwarded sensor logs (default: debug = forward everything)
# (error, warn, info, debug)
# forward-sensor-logs-level: info

# Optional: Express JSON body size limit (default: 1mb)
#express-body-limit: "1mb"

# Optional: Rate limiting (applied to all routes)
# rate-limit-window-ms: 900000    # 15 minutes in milliseconds
# rate-limit-max: 100              # max requests per window

# Optional: CORS allowed origins (browser UIs only). Each entry must be an
# http(s) origin of the form scheme://host[:port] (no path/credentials). When
# absent, NO cross-origin browser origin is authorized (secure default);
# non-browser clients (no Origin header) are unaffected.
# cors-allowed-origins:
#   - "http://10.10.10.7:4200"

# Optional: silence timeout for sensor command responses (default: 1500ms)
# command-silence-timeout-ms: 5000

**Required config keys:** `express-port` (positive int), `log-level` (error/warn/info/debug), `prometheus-port` (positive int), `mqtt-broker-ip-address`, `mqtt-topic-telemetry`, `mqtt-topic-command`, `mqtt-topic-command-response`, `ip-pinger-web-api`, `case-sensitive` (boolean), `db-host`, `db-port`, `db-name`, `db-user`, `db-password`.

**Optional config keys:** `swagger-server-url`, `loki-url`, `loki-enabled`, `mqtt-topic-log` (default `iot/v3/log`), `forward-sensor-logs`, `forward-sensor-logs-level`, `express-body-limit`, `rate-limit-window-ms`, `rate-limit-max`, `sensor-source-max-length` (default 30), `sensor-source-valid-chars-regex`, `ippinger-fetch-timeout-ms` (default 10000; bounds only the IP pinger proxy/analyze fetches — the old key `fetch-timeout-ms` is still accepted as a deprecated alias, and if both are set the new key wins; see `resolveIppingerFetchTimeoutMs()`), `command-silence-timeout-ms`, `cors-allowed-origins` (list of http(s) origins; empty/absent = no cross-origin browser origin authorized).

**Docker config mount:** `code/docker-compose.yml` mounts host dir `/mnt/sensor-services/` → `/app/configs/`; app reads `config.yml` from `/app/configs/config.yml` (falling back to `./dist/config.yml`), merging an optional sibling `config-secrets.yml` for credentials. The mounted config must supply the required `db-password` — see the "Docker configuration strategy (P3-8)" note. Settings persistence stores to PostgreSQL database.

## Key Patterns and Caveats

- **`dodsonlabs/` is a shared library** — cloned from `http://10.10.10.7:30008/sensor-services/dodson-labs-core.git` (main branch). Excluded from ESLint and test coverage (shared library, not a git submodule). Clone manually: `git clone --branch main http://10.10.10.7:30008/sensor-services/dodson-labs-core.git && mv dodson-labs-core dodsonlabs`.
- **No authentication or authorization** — middleware only provides CORS, JSON parsing, rate limiting, request ID propagation, and body validation. This is a documented, accepted deployment decision: the service runs only on a trusted private LAN, and network segmentation/firewall rules are the access-control boundary for the configuration endpoints (see the README "Security and Deployment Assumptions" section).
- **CORS is restricted to configured origins (P3-5)** — `cors({ origin: cors-allowed-origins })` replaces the old unrestricted `cors()`. Each `cors-allowed-origins` entry must be a well-formed http(s) origin (`scheme://host[:port]`, no path/credentials) — validated by Zod at startup so a malformed entry fails fast. A request whose `Origin` is in the list gets `Access-Control-Allow-Origin` reflecting it; a disallowed origin gets NO CORS header (the browser then blocks the cross-origin response / preflight); a non-browser request (no `Origin` header — curl, the pinger service, server-to-server) is unaffected. When the key is absent the allowlist is empty, so no cross-origin browser origin is authorized (secure default) — set the web UI origin(s) in config to enable browser access. Only `origin` is constrained; default allowed methods/headers are unchanged.
- **Settings updates report persistence state (P3-6)** — `PATCH /ui/settings-update` sets the `X-Settings-Persisted` header: `true` when the update was written to PostgreSQL, `false` when it was only applied in-memory because the database is unavailable (the value will not survive a restart). The flag comes from `settingsStore.isPersistenceAvailable()` (`pool !== null`). The response body shape is intentionally unchanged (still the merged settings object, which the web app's `transformSettings()` reads flat keys from), so the flag rides in a header instead of a `{ settings, persisted }` wrapper.
- **The settings update schema is strict (P3-7)** — `appSettingsUpdateSchema` is `.strict()`, so an unknown key (e.g. a typo'd `them` for `theme`) is rejected with 400 `Invalid settings update: …` instead of being silently stripped and left at its current value. Known keys keep their partial-update semantics (only keys present are changed); a body mixing a known and an unknown key is rejected as a whole and nothing is applied.
- **No CI/CD pipeline** — no GitHub Actions, GitLab CI, or other automation.
- **All logging goes through Winston** — `error`/`warn`/`info`/`debug` levels, console transport always active, optional Loki transport. `handle_mqtt_message_log()` in MqttNetworking forwards sensor application logs at the appropriate level; controlled by `forward-sensor-logs` (on/off) and `forward-sensor-logs-level` (minimum level, default `debug`) config keys.
- **Sensor commands use event-based completion** — `MqttCommandControl.waitForCompletion()` with a 10-second hard safety cap via `AbortController`. Replaces the old 1-second polling loop.
- **MQTT-backed commands fail with HTTP 503 when the broker is disconnected** — the controller checks `is_connected()` before publishing (before the slot is claimed), so a disconnected broker returns `503 { error: "MQTT broker unavailable" }` instead of `200 []`. `MqttNetworking` also sets `queueQoSZero: false` so a publish that loses the disconnect race is dropped, never delivered late.
- **Slot acquisition + publish are failure-atomic (P2-1)** — the pre-slot `is_connected()` gate and the publish are not atomic, so the controller re-checks `is_connected()` AFTER acquiring the slot: if the broker disconnected in the gap (or while waiting for the slot) it releases the slot (`deinitialize()`) and returns 503 rather than publish into the void. The publish itself is wrapped in try/catch: if `publish_mqtt_message()` throws after `initialize()`, the command control is `deinitialize()`d (releasing the slot) and the error rethrown, so a failed publish can never hold the slot and block every subsequent command of that type.
- **Sensor command slots are serialized with an atomic `claim()`** — a second concurrent caller of the same command type waits, then publishes its OWN command; results are snapshotted at wait-completion so a caller never responds with another caller's (or stale/empty) results.
- **MQTT messages on untracked topics are dropped** — the broker is unauthenticated, so `MqttNetworking.on_message()` warns and drops any message whose topic is not one of the subscribed topics (command-response, V3 info-request, and the log topic when forwarding is enabled).
- **`on_disconnect()` and `on_error()` rely on the mqtt library's auto-reconnect** — manual reconnection was removed (created race conditions). The `reconnectPeriod: 5000` handles reconnection automatically.
- **`feels_like_c` uses the NOAA/NWS Rothfusz regression** — `MqttNetworking.calculateHeatIndex()` applies the 9-term Rothfusz regression (valid at T >= 80°F) with the low-humidity (RH < 13%) and high-humidity (RH > 85%, T <= 87°F) corrections; below 80°F the preliminary approximation is used, below 20°C the air temperature itself, and missing/non-finite inputs return undefined (enrichment then safely omits `feels_like_c`).
- **Native `fetch` API is used** (Node 18+ built-in) — `node-fetch` was removed from dependencies.
- **`swagger-server-url` is configurable** via `config.yml` (falls back to auto-derived from routable IP + port). `routableAddress()` skips loopback and Docker-internal addresses.
- **`case-sensitive` is configurable** via `config.yml` (used by `analyzeIt()` in pingerController).
- **V3 MQTT protocol (firmware v4)** — outbound commands use the `message_schema_version: 3` envelope with a required `payload` object (write-config wraps the complete config as `{"config": <config>}`); command responses are parsed from `payload.command`/`payload.command_id` (no top-level `type`). The `identify` command and `/sensors/identify` routes were removed — use `get-details` (sensor IP now at `payload.data.network.ip_address` in pinger analysis). `update-config` is not supported by firmware v4 — the route returns 501.
- **`write-config` is an active** POST endpoint in `sensorRoutes.ts`; **`update-config` is deprecated** and returns 501 (NotImplemented).
- **`write-config` rejects the broadcast target `*` (P1-2)** — `postWriteConfigBySource()` checks `isBroadcastTarget(source)` and returns 400 (no broker check, slot claim, or MQTT publish) when the source normalizes to the MQTT wildcard `*` (including `%2A`/`%2a` and surrounding whitespace). Publishing a config to `*` would rewrite every sensor on the broker at once. The read commands (`get-details`, `read-config`) and `reboot` legitimately broadcast to `*` and are unaffected.
- **`routeNotFound.ts` is wired** into the app via `new CreateRouteNotFound(app)` in `index.ts`. Uses `if (!res.headersSent)` guard to prevent double-sending when matched routes fall through without calling next(). Unmatched routes are logged at **warn**, not error (P3-3) — a 404 is client behavior (typo, scanning, stale link), not a server failure, so it must not pollute error-level alerts.
- **`prometheus-port` and `case-sensitive` are validated at startup** — `prometheus-port` must be a positive integer, `case-sensitive` must be a boolean. Config is loaded from `config.yml` (YAML) and validated with Zod v4 schemas in `src/schemas/config.ts`.
- **`formatElapsedTime()` is used** in graceful shutdown logging (`Uptime: ${formatElapsedTime(...)}`).
- **`sys_info` array in `aboutDude()` is now populated** with platform, arch, hostname, uptime, total/free memory.
- **Docker container** (via `code/docker-compose.yml`) mounts `config.yml` into the container at `/app/configs/config.yml`. Runs as non-root user (`appuser`). Healthcheck probes `/health` every 30s.
- **Docker build is the canonical build (P3-8)** — the builder stage runs `npm run build` (tsc + copy `config.yml`→`dist/`) instead of re-implementing its steps, so Docker and bare-metal builds cannot drift. The final image copies only `dist/`, the `src/routes/` subset (Swagger scans `src/routes/**/*.ts` at startup), and `package*.json` — not the whole source tree. `config-secrets.yml` never enters the image: it is excluded by `.dockerignore` AND explicitly `rm -f`'d after the build in the builder stage (defense in depth). The final image's WORKDIR is `/app` (with `CMD node dist/index.js`) so the CWD-relative `./dist/config.yml` fallback resolves identically to bare metal. Because the committed default is secret-free (no `db-password`), a container requires a **mounted config** to supply credentials and exits at startup without one — the intended, documented behavior pinned by `tests/docker/verify.sh` (e2e) and `tests/__tests__/docker/docker.test.ts` (static guards).
- **`__routesHelp` objects in each route file** are the single source of truth for the `/about` command list (aggregated in `generalController.ts` — note pingerRoutes is included, so `/sensors/ippinger-analyze` appears under a "Pinger" section). Drift is checked at startup in two passes (P3-4): `validateRoutesHelp()` in `index.ts` verifies each module's `__routes` matches its own `__routesHelp` (static↔static), and `assertRoutesMatchDeclared()` in `routeDrift.ts` verifies the union of all declared `__routes` equals the routes actually registered on the live Express app (read from `app._router.stack`). Route metadata must live in the module that actually registers the route — `/sensors/ippinger-analyze` is registered in `pingerRoutes`, so its `__routes`/`__routesHelp` entries belong there, not in `sensorRoutes`.
- **`createAnalyzeResult` spreads its `origin` argument** (no longer mutates in-place).
- **`pingerController.ts` uses `async/await`** consistently — `fetchIt()`/`postIt()`/`fetchItOnly()` all use async/await. `getAnalyzeIpPinger()` gracefully degrades when the pinger service is unreachable (returns live sensors with a warning).
- **IP-pinger responses are schema-validated before analysis** — `getAnalyzeIpPinger()` Zod-validates the `/read-config` body (`ippingerConfigSchema`: `devices` array of `{ source, ipAddress | ip-address }`) because `fetchItOnly()` only guarantees 2xx + parseable JSON, not the schema. An HTTP 200 body that fails validation degrades exactly like an unavailable pinger (200 + `warning` + `live_sensors` only) — it must never reach `analyzeIt()` unchecked, since a rejected async handler is not caught by Express 4 and the process-level `unhandledRejection` handler would initiate shutdown. The current ip-pinger's camelCase `ipAddress` is normalized to the internal kebab-case `ip-address` key (older kebab-case builds are also accepted).
- **`validateIpAddress()`** in pingerController validates IPv4 addresses strictly — rejects private/reserved ranges and URL injection characters. Used by `getPing()`.
- **`fetchWithTimeout()`** in pingerController wraps native `fetch()` with `AbortSignal.timeout()`.
- **Command deduplication** — `MqttNetworking` tracks outbound command IDs in `seen_command_ids` map with TTL-based eviction and max size cap to prevent duplicates on reconnect.
- **Command latency tracking** — `MqttNetworking` records publish timestamps in `__command_publish_times` and observes `mqtt_command_latency_seconds` histogram on response.
- **`uncaughtException`/`unhandledRejection`** — top-level handlers in `index.ts` call `shutdown()` to trigger graceful shutdown on fatal errors. Both format their diagnostic through `formatFatalError()` (common/shutdown.ts, Optional-1), which normalizes the value with `ensureError()` — a non-Error thrown/rejected value (string, number, object, `undefined`) logs its normalized content instead of "undefined", and a stack is appended only when the value is a genuine Error (the wrapper stack of a normalized value is dropped as noise).
- **Config migrated from JSON to YAML** — `config.yml` is loaded via `read_file_yaml()` and validated with Zod v4 schemas in `src/schemas/config.ts`. The old `config.json` was replaced.
- **Config writes are atomic** — `/api/write-config` uses `write_file_atomic()` (unique same-directory temp file + rename), so a failure mid-write can never truncate the live `config.yml`; the temp file is removed and the prior config preserved on failure.
- **Secrets never reach the logs** — `redactSecrets()` (SystemFunctions.ts) recursively masks `SENSITIVE_SECRET_KEYS` (`wifi-password`, `password`, `db-password`, matched case-insensitively at any nesting depth) without mutating the input. `MqttNetworking.publish_mqtt_message()` logs a sanitized copy only: a `write-config` publish logs metadata (`{command, target, command_id}`) and every other command logs a redacted copy of the message. The MQTT message that is actually published is never touched. Incoming command-response configs are redacted with the same helper before logging.
- **Config secrets are split out (P1-4)** — `readConfigWithSecrets()` (src/schemas/configLoader.ts) reads the base `config.yml` and merges an optional sibling `config-secrets.yml` (override) before the merged result is validated against the full Zod schema. The tracked `config.yml` holds no real credentials; `config-secrets.example.yml` is the tracked template. A missing required secret fails validation at startup (clear error, no silent fallback); a present-but-corrupt secrets file is a hard error. Both `index.ts` startup and `doReloadConfig()` use the merged loader. `config-secrets.yml` is gitignored and excluded from the Docker build context, so no real secret is committed or baked into the image.
- **Request ID propagation** — every request gets a unique `X-Request-ID` (client-provided or generated UUID). Stored in `AsyncLocalStorage` so all log lines are traceable. Attached to `req.id` for downstream access.
- **Rate limiting** — applied to all routes via `express-rate-limit`. Default: 100 requests per 15 minutes. Configurable via `rate-limit-window-ms` and `rate-limit-max`. Uses standard RFC 9110 headers (`RateLimit-*`). `/health` and `/metrics` are exempt (`skip`), so the Docker healthcheck and Prometheus scrapes can never be 429'd into marking the container unhealthy or dropping metrics. Runs BEFORE the JSON body parser (P3-2), so an over-limit request's (potentially oversized) body is rejected with a 429 without ever being parsed. Because it runs after request-ID and metrics, a 429 response carries an `X-Request-ID` and is counted in the API metrics.
- **Health probe timeout leaves margin under Docker's deadline (P2-3)** — each `/health` dependency probe (IP pinger, sensor telemetry) uses `AbortSignal.timeout(2500ms)` (`HEALTH_CHECK_TIMEOUT_MS`), materially shorter than Docker's `--timeout=5s`. The probes run concurrently, so worst-case `/health` latency is ~2.5s — a wedged dependency is classified `unreachable` (→ `degraded`, still HTTP 200) instead of pushing the endpoint past Docker's 5s deadline and making an up-but-degraded container look down.
- **Body validation** — a present body is validated as a JSON object with Zod (`validatePostBody()`); returns 400 if a body is present but not a JSON object. A missing body is passed through untouched — "body required" is a route-level concern owned by each controller (e.g. `configController`'s write-config returns its own 400). Replaces `req.body` with the validated object.
- **API metrics middleware** — `createApiMetricsMiddleware()` (common/metrics.ts) wraps `res.end()` to capture final status code, computes request duration via `process.hrtime()`, records to separate prom-client registry. Exposed at `/metrics`. The route label is the matched route pattern; unmatched requests collapse to the bounded `"unmatched"` sentinel so arbitrary 404 paths cannot grow label cardinality without bound. Installed AHEAD of the rate limiter (passed into `CreateMiddleware`, P3-2) so terminal 429 responses are counted — they land under the `"unmatched"` route label because rate limiting ends the request before a route matches.
- **Graceful shutdown** — 15-second hard timeout safety net (cleared before exit, so it can never log after the logger closes) plus a re-entrancy guard against double signals. Sequence lives in `common/shutdown.ts` (`runGracefulShutdown()`): stop accepting new requests → close HTTP server → close MQTT client (5s timeout) → cleanup settingsStore persistence resources → emit the final shutdown log → close the active logger exactly once (once-guarded, so buffered transports like the Loki batch timer flush). Nothing may log after the close.
- **MQTT close clears its timeout when the graceful close wins (P3-1)** — `MqttNetworking.close(timeout_ms)` races the graceful `end()` against a `setTimeout` that forces the disconnect. The timeout handle is now captured and `clearTimeout()`ed in a `finally` around the race, so a clean shutdown that finishes before the deadline no longer leaves a live timer that would (a) force a second, forced disconnect after an already-clean close and (b) emit a spurious "timed out" error during a successful shutdown. The forced path still fires when the graceful close genuinely overruns the deadline.
- **Process exit-code contract (P2-2)** — the caller (index.ts) chooses the exit code: SIGINT/SIGTERM → `0` (clean, operator-requested stop); uncaughtException/unhandledRejection → `1` (a crash, so a supervisor can distinguish it from a deliberate stop); fatal startup errors (invalid config, HTTP bind failure such as EADDRINUSE) → `1`; hard shutdown timeout → `1`. A `server.on("error")` handler turns a bind failure into a logged fatal startup error.
- **Config reload applies only hot-reloadable keys at runtime** — `doReloadConfig()` updates the active in-memory config with only `HOT_RELOADABLE_KEYS` (currently `log-level`) and mutates the log level on the existing logger instance via `Logger.setLevel()`. Restart-required values from the file stay inactive until restart, so `/api/read-config` never reports inactive values as active and long-lived components never hold a closed logger.
- **`log-level` enum includes `warn`** — valid values are `error`, `warn`, `info`, `debug`.
- **Zod v4** — upgraded from Zod v3. Schema uses `z.enum()` with `error` option for custom error messages.
- **ESLint flat config** — `eslint.config.mjs` uses `@typescript-eslint` v8. Rules: `noUnusedLocals`/`noUnusedParameters` via tsconfig, `@typescript-eslint/no-explicit-any: warn`, `@typescript-eslint/no-non-null-assertion: warn`, `@typescript-eslint/consistent-type-imports: warn`.
- **tsconfig.json** — `module: "NodeNext"`, `noUnusedLocals: true`, `noUnusedParameters: true`, `isolatedModules: true`. Excludes `tests/`, `eslint.config.mjs`, `jest.config.ts`, `jest.setup.ts`, `src/dodsonlabs/`.
