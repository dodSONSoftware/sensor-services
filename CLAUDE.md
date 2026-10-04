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
    ├── package.json       -- Dependencies, scripts, Volta config (Node 22.22.0, version 4.12.1)
    ├── tsconfig.json      -- ES2022, NodeNext, strict mode, noUnusedLocals/Parameters, outDir: dist
    ├── jest.config.ts     -- Jest config (ts-jest preset, node environment, 70% coverage threshold)
    ├── jest.setup.ts      -- Test setup (suppresses console output)
    ├── Dockerfile         -- Two-stage build (Node 22), non-root user, healthcheck, exposes port 32000
    ├── docker-compose.yml -- Docker Compose: build + run with configs dir mount (/app/configs/), restart: unless-stopped
    ├── nodemon.json       -- Dev watch config
    ├── eslint.config.mjs  -- ESLint 9.x flat config (@typescript-eslint v8), excludes tests/, dodsonlabs/, jest config files, coverage/
    ├── .vscode/           -- VS Code workspace settings
    │   ├── extensions.json    -- Recommended extensions (eslint)
    │   └── settings.json      -- Workspace settings (ESLint validation, code actions on save)
    ├── .dockerignore      -- Docker build exclusions (node_modules, tests, coverage, etc.)
    ├── .editorconfig      -- Editor config (indentation, charset, line endings)
    ├── src/
    │   ├── index.ts       -- Entry point: config load, Zod validation, logger init, MQTT init, Swagger, middleware, API metrics, routes, listen, graceful shutdown (15s hard timeout)
    │   ├── version.ts     -- App version source of truth: APP_VERSION + APP_NAME (release codename, derived per the codename scheme in .claude/commands/git-commit.md); package.json version kept in sync
    │   ├── config.yml     -- Runtime configuration (MQTT broker, topics, ports, rate limiting, YAML format)
    │   ├── swagger.ts     -- Swagger UI setup at /swagger (auto-derived from routable IP + port, overridable via config `swagger-server-url`)
    │   ├── common/
    │   │   ├── global.ts  -- Global logger singleton, AsyncLocalStorage request ID propagation, aboutDude() metadata (system_info now populated)
    │   │   ├── metrics.ts -- API Prometheus metrics: http_requests_total (Counter), http_request_duration_seconds (Histogram), http_errors_total (Counter) — separate registry from sensor gauges
    │   │   └── app-request.d.ts -- Express Request augmentation with optional id field
    │   ├── controllers/
    │   │   ├── generalController.ts  -- /about, /date_local, /date_utc, /health (includes memory/CPU/uptime, cpu.load)
    │   │   ├── sensorController.ts   -- MQTT-based sensor command handlers (event-based completion via waitForCompletion + AbortController, 10s hard cap, per-type slot serialization via claim(), each request publishes its own command)
    │   │   ├── pingerController.ts   -- IP Pinger proxy + analyze logic (async/await, graceful degradation, validateIpAddress() rejects private/reserved IPs, fetchWithTimeout() via AbortSignal.timeout())
    │   │   ├── logController.ts      -- GET /sensors/logs/:source (Loki queries; source allowlist-validated against LogQL injection, level allowlist, fetch timeout via AbortSignal)
    │   │   └── settingsController.ts -- GET /ui/settings, GET /ui/settings-schema, PATCH /ui/settings-update
    │   ├── middleware/
    │   │   └── middleware.ts -- CORS, JSON parser (configurable body limit), rate limiting (default 100 req/15min), request ID (X-Request-ID + AsyncLocalStorage), request logger, body validation (Zod)
    │   ├── routes/
    │   │   ├── generalRoutes.ts   -- /about, /date-local, /date-utc, /health, /metrics (dash-variant aliases for date routes)
    │   │   ├── sensorRoutes.ts    -- /sensors/* (MQTT command routes)
    │   │   ├── pingerRoutes.ts    -- /ippinger/* (proxy routes, configurable fetch_timeout_ms)
    │   │   ├── settingsRoutes.ts  -- /ui/settings, /ui/settings-schema, /ui/settings-update (PostgreSQL persistence via settingsStore)
    │   │   ├── logRoutes.ts       -- /sensors/logs/:source (Loki log queries)
    │   │   └── routeNotFound.ts   -- 404 handler (wired into app)
    │   ├── schemas/
    │   │   ├── config.ts        -- Zod v4 schemas for config.yml validation (log-level: error/info/debug/warn)
    │   │   ├── postBody.ts      -- Zod schemas for POST body validation
    │   │   └── settings.ts      -- Zod schemas + defaults + metadata for application settings (UI preferences + server connection details)
    │   ├── services/
    │   │   └── settingsStore.ts -- PostgreSQL-backed persistence for application settings (init, getSettings, patchSettings)
    │   └── dodsonlabs/          -- Shared library (git clone from dodson-labs-core)
    │       ├── CreatorBase.ts       -- Abstract RoutesCreatorBase for route creators
    │       ├── Interfaces.ts        -- IAbout, ILogger, IMqttCommandControl, IMqttNetworking, LogLevel
    │       ├── HttpConstants.ts     -- HTTP status codes and MIME types
    │       ├── Logger.ts            -- Console logger with Error/Warn/Info/Debug levels, requestId in output
    │       ├── SystemFunctions.ts   -- File I/O, sleep, timestamps, bash exec, error helpers
    │       ├── MqttNetworking.ts    -- MQTT client, command-response tracker (drops messages on untracked topics; telemetry handling moved to sensor-telemetry-service)
    │       ├── MqttCommandControl.ts -- Timeout-based state machine for command-response pairs (atomic claim() slot serialization, last_sent_at)
    │       └── version.txt          -- Library version (1.2.8)
    ├── tests/
    │   ├── mocks/
    │   │   ├── express.ts   -- createMockRes(), createMockReq() helpers
    │   │   └── mqtt.ts      -- createMockMqttNetworking() helper (adds waitForCompletion, register_command_id)
    │   └── __tests__/
    │       ├── swagger.test.ts  -- setupSwagger(): served spec contains real route paths (not the stale empty doc)
    │       ├── common/
    │       │   └── global.test.ts -- AsyncLocalStorage request ID tests, createLogger(), setReqIdStore()
    │       ├── controllers/
    │       │   ├── configController.test.ts   -- diffConfigReload(), reload-config/write-config restart_required reporting, readConfig() secret masking
    │       │   ├── generalController.test.ts  -- /about, /date_local, /date_utc, /health
    │       │   ├── logController.test.ts      -- /sensors/logs/:source: LogQL injection guard (400), level allowlist, AbortSignal wiring
    │       │   ├── sensorController.test.ts   -- create_mqtt_command_message(), get_it/post_it error paths, already-running (waiter publishes own command), concurrency (real MqttCommandControl), hard timeout
    │       │   ├── pingerController.test.ts   -- analyzeIt(), createAnalyzeResult(), fetchIt/postIt/fetchItOnly non-OK responses
    │       │   └── settingsController.test.ts -- getAllSettings, getSettingsScheme, updateSettings
    │       ├── routes/
    │       │   ├── configRoutes.test.ts       -- /api/reload-config, /api/read-config, /api/write-config via supertest
    │       │   ├── generalRoutes.test.ts      -- Integration tests via supertest
    │       │   ├── sensorRoutes.test.ts       -- All /sensors/* routes via supertest (identify→404, get-details, reboot, read-config, write-config, update-config→501)
    │       │   ├── pingerRoutes.test.ts       -- All /ippinger/* routes via supertest (about, read-config, write-config, restart, ping, ping/:target, analyze-ippinger)
    │       │   ├── settingsRoutes.test.ts     -- GET /settings, GET /settings/schema, PATCH /settings/update via supertest
    │       │   └── routeNotFound.test.ts      -- 404 handler tests (including uninitialized logger)
    │       ├── schemas/
    │       │   ├── config.test.ts     -- Zod v4 config schema validation tests
    │       │   └── postBody.test.ts   -- Zod POST body schema tests
    │       ├── services/
    │       │   ├── settingsStore.test.ts     -- validateSettingsFromDb: nested/legacy key resolution, migrations, schema validation
    │       │   └── settingsStoreInit.test.ts -- init(): seeding, corrupt-row repair (UPSERT), bootstrap pool cleanup
    │       └── dodsonlabs/
    │           ├── MqttCommandControl.test.ts -- State machine tests (fake timers), claim() slot serialization
    │           ├── MqttNetworking.test.ts     -- MQTT networking tests (dedup, latency, telemetry validation, untracked-topic drop)
    │           ├── PrometheusWriter.test.ts   -- PrometheusWriter tests (source sanitization, range checks)
    │           └── SystemFunctions.test.ts    -- ensureError(), formatElapsedTime(), log level converters
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
npm run blt            # CI check: build + lint + test with coverage (runs `.claude/commands/ci.sh`, exit 1 if any step fails or coverage < 70%)

### Docker

```bash
docker compose up --build   # Build image + run container (config.yml mounted from /mnt/sensor-services/config.yml)
docker compose down         # Stop and remove container

**docker-compose.yml** (in `code/`) mounts a host `config.yml` into the container at `/app/configs/config.yml`. The container exposes port 32000 (API). Healthcheck probes `/ready` every 30s (`timeout: 5s`, `retries: 3`, `start_period: 10s`). Container restarts automatically with `restart: unless-stopped`.

### Notes

- Jest configured via `jest.config.ts` (ts-jest preset, node environment, 70% coverage threshold). Excludes `src/dodsonlabs/**/*.ts` and `src/index.ts` from coverage.
- ESLint 9.x configured via `eslint.config.mjs` with `@typescript-eslint` v8. Excludes `tests/`, `src/dodsonlabs/`, `jest.config.ts`, `jest.setup.ts`.
- No CI/CD pipeline exists.
- Uses Volta to pin Node 22.22.0 / npm 10.9.4.
- `dodsonlabs/` is excluded from ESLint and test coverage (shared library, not a git submodule).
- `tsconfig.json` uses `module: "NodeNext"`, `noUnusedLocals: true`, `noUnusedParameters: true`. Excludes `coverage/` to prevent leaked test artifacts from blocking builds.
- Dockerfile runs as non-root user (`appuser`), includes HEALTHCHECK on `/ready`.

## Architecture

### Overview

This is an Express REST API that bridges IoT weather sensors to HTTP clients and Prometheus. It runs a single HTTP server:

1. **Main Express app** on port 32000 (configurable via `express-port` in config) — serves REST API + Swagger UI + API metrics at `/metrics`
2. **Prometheus metrics server** on port 3301 (configurable via `prometheus-port` in config) — exposes `/metrics` with 10 sensor gauges

The app connects to an MQTT broker for real-time sensor telemetry ingestion and command-response communication.

### Startup Flow (`src/index.ts`)

1. Read config from `/app/configs/config.yml` (falls back to `./dist/config.yml`) via `read_file_yaml()` returning typed `ReadFileResult`
2. Validate config with Zod v4: required keys (`mqtt-broker-ip-address`, `mqtt-topic-telemetry`, `mqtt-topic-command`, `mqtt-topic-command-response`, `ip-pinger-web-api`, `express-port`, `prometheus-port`, `case-sensitive`, `log-level`), MQTT topic strings must be non-empty, ports must be positive integers, `case-sensitive` must be boolean, `log-level` must be one of `error`/`warn`/`info`/`debug`. Optional keys: `swagger-server-url`, `loki-url`, `loki-enabled`, `forward-sensor-logs`, `forward-sensor-logs-level`, `express-body-limit`, `rate-limit-window-ms`, `rate-limit-max`, `sensor-source-max-length`, `sensor-source-valid-chars-regex`, `fetch-timeout-ms`, `command-silence-timeout-ms`
3. Create global `Logger` instance via `createLogger(config)` — Winston-backed with `error`/`warn`/`info`/`debug` levels, optional Loki transport
4. Create `MqttNetworking` instance (connects to MQTT broker, subscribes to command-response topic)
5. Get port from config `express-port`
6. Setup Swagger at `/swagger` (auto-derived from routable IP + port, overridable via config `swagger-server-url`)
7. Create middleware (CORS, JSON parsing with configurable body limit, rate limiting, request ID propagation via AsyncLocalStorage, request logger, body validation)
8. Register API metrics middleware (tracks request duration/status/errors using separate prom-client registry)
9. Initialize settings persistence (`settingsStore.init()`) — connects to PostgreSQL, creates DB/table if needed, seeds defaults
10. Register route groups: `generalRoutes`, `sensorRoutes`, `pingerRoutes`, `settingsRoutes`, `routeNotFound`
11. Validate `__routesHelp` entries match actual registered routes (drift detection)
12. Listen on configured port
13. Register `uncaughtException`/`unhandledRejection` handlers — call `shutdown()` to trigger graceful shutdown
14. Register graceful shutdown handlers for `SIGTERM`/`SIGINT` — 15s hard timeout safety net, closes HTTP server, then closes MQTT client (gauges are in-memory, no flush needed)

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
- `getSettings()` returns deep clone; `patchSettings(updates)` merges partial updates and persists to DB
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
| PATCH | `/ui/settings-update` | Partial update — only fields in body are changed; persists to DB, returns merged result |

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
| POST | `/sensors/write-config/:source` | Write the complete config to a specific sensor (MQTT command) |
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

# Optional: silence timeout for sensor command responses (default: 1500ms)
# command-silence-timeout-ms: 5000

**Required config keys:** `express-port` (positive int), `log-level` (error/warn/info/debug), `prometheus-port` (positive int), `mqtt-broker-ip-address`, `mqtt-topic-telemetry`, `mqtt-topic-command`, `mqtt-topic-command-response`, `ip-pinger-web-api`, `case-sensitive` (boolean), `db-host`, `db-port`, `db-name`, `db-user`, `db-password`.

**Optional config keys:** `swagger-server-url`, `loki-url`, `loki-enabled`, `mqtt-topic-log` (default `iot/v3/log`), `forward-sensor-logs`, `forward-sensor-logs-level`, `express-body-limit`, `rate-limit-window-ms`, `rate-limit-max`, `sensor-source-max-length` (default 30), `sensor-source-valid-chars-regex`, `fetch-timeout-ms`, `command-silence-timeout-ms`.

**Docker config mount:** `code/docker-compose.yml` mounts host dir `/mnt/sensor-services/` → `/app/configs/`; app reads `config.yml` from `/app/configs/config.yml`. Settings persistence stores to PostgreSQL database.

## Key Patterns and Caveats

- **`dodsonlabs/` is a shared library** — cloned from `http://10.10.10.7:30008/sensor-services/dodson-labs-core.git` (main branch). Excluded from ESLint and test coverage (shared library, not a git submodule). Clone manually: `git clone --branch main http://10.10.10.7:30008/sensor-services/dodson-labs-core.git && mv dodson-labs-core dodsonlabs`.
- **No authentication or authorization** — middleware only provides CORS, JSON parsing, rate limiting, request ID propagation, and body validation. This is a documented, accepted deployment decision: the service runs only on a trusted private LAN, and network segmentation/firewall rules are the access-control boundary for the configuration endpoints (see the README "Security and Deployment Assumptions" section).
- **No CI/CD pipeline** — no GitHub Actions, GitLab CI, or other automation.
- **All logging goes through Winston** — `error`/`warn`/`info`/`debug` levels, console transport always active, optional Loki transport. `handle_mqtt_message_log()` in MqttNetworking forwards sensor application logs at the appropriate level; controlled by `forward-sensor-logs` (on/off) and `forward-sensor-logs-level` (minimum level, default `debug`) config keys.
- **Sensor commands use event-based completion** — `MqttCommandControl.waitForCompletion()` with a 10-second hard safety cap via `AbortController`. Replaces the old 1-second polling loop.
- **MQTT-backed commands fail with HTTP 503 when the broker is disconnected** — the controller checks `is_connected()` before publishing (before the slot is claimed), so a disconnected broker returns `503 { error: "MQTT broker unavailable" }` instead of `200 []`. `MqttNetworking` also sets `queueQoSZero: false` so a publish that loses the disconnect race is dropped, never delivered late.
- **Sensor command slots are serialized with an atomic `claim()`** — a second concurrent caller of the same command type waits, then publishes its OWN command; results are snapshotted at wait-completion so a caller never responds with another caller's (or stale/empty) results.
- **MQTT messages on untracked topics are dropped** — the broker is unauthenticated, so `MqttNetworking.on_message()` warns and drops any message whose topic is not one of the subscribed topics (command-response, V3 info-request, and the log topic when forwarding is enabled).
- **`on_disconnect()` and `on_error()` rely on the mqtt library's auto-reconnect** — manual reconnection was removed (created race conditions). The `reconnectPeriod: 5000` handles reconnection automatically.
- **Native `fetch` API is used** (Node 18+ built-in) — `node-fetch` was removed from dependencies.
- **`swagger-server-url` is configurable** via `config.yml` (falls back to auto-derived from routable IP + port). `routableAddress()` skips loopback and Docker-internal addresses.
- **`case-sensitive` is configurable** via `config.yml` (used by `analyzeIt()` in pingerController).
- **V3 MQTT protocol (firmware v4)** — outbound commands use the `message_schema_version: 3` envelope with a required `payload` object (write-config wraps the complete config as `{"config": <config>}`); command responses are parsed from `payload.command`/`payload.command_id` (no top-level `type`). The `identify` command and `/sensors/identify` routes were removed — use `get-details` (sensor IP now at `payload.data.network.ip_address` in pinger analysis). `update-config` is not supported by firmware v4 — the route returns 501.
- **`write-config` is an active** POST endpoint in `sensorRoutes.ts`; **`update-config` is deprecated** and returns 501 (NotImplemented).
- **`routeNotFound.ts` is wired** into the app via `new CreateRouteNotFound(app)` in `index.ts`. Uses `if (!res.headersSent)` guard to prevent double-sending when matched routes fall through without calling next().
- **`prometheus-port` and `case-sensitive` are validated at startup** — `prometheus-port` must be a positive integer, `case-sensitive` must be a boolean. Config is loaded from `config.yml` (YAML) and validated with Zod v4 schemas in `src/schemas/config.ts`.
- **`formatElapsedTime()` is used** in graceful shutdown logging (`Uptime: ${formatElapsedTime(...)}`).
- **`sys_info` array in `aboutDude()` is now populated** with platform, arch, hostname, uptime, total/free memory.
- **Docker container** (via `code/docker-compose.yml`) mounts `config.yml` into the container at `/app/configs/config.yml`. Runs as non-root user (`appuser`). Healthcheck probes `/ready` every 30s.
- **`__routesHelp` objects in each route file** are the single source of truth for the `/about` command list; `validateRoutesHelp()` in `index.ts` checks for drift at startup between `__routesHelp` entries and actual registered routes.
- **`createAnalyzeResult` spreads its `origin` argument** (no longer mutates in-place).
- **`pingerController.ts` uses `async/await`** consistently — `fetchIt()`/`postIt()`/`fetchItOnly()` all use async/await. `getAnalyzeIpPinger()` gracefully degrades when the pinger service is unreachable (returns live sensors with a warning).
- **`validateIpAddress()`** in pingerController validates IPv4 addresses strictly — rejects private/reserved ranges and URL injection characters. Used by `getPing()`.
- **`fetchWithTimeout()`** in pingerController wraps native `fetch()` with `AbortSignal.timeout()`.
- **Command deduplication** — `MqttNetworking` tracks outbound command IDs in `seen_command_ids` map with TTL-based eviction and max size cap to prevent duplicates on reconnect.
- **Command latency tracking** — `MqttNetworking` records publish timestamps in `__command_publish_times` and observes `mqtt_command_latency_seconds` histogram on response.
- **`uncaughtException`/`unhandledRejection`** — top-level handlers in `index.ts` call `shutdown()` to trigger graceful shutdown on fatal errors.
- **Config migrated from JSON to YAML** — `config.yml` is loaded via `read_file_yaml()` and validated with Zod v4 schemas in `src/schemas/config.ts`. The old `config.json` was replaced.
- **Config writes are atomic** — `/api/write-config` uses `write_file_atomic()` (unique same-directory temp file + rename), so a failure mid-write can never truncate the live `config.yml`; the temp file is removed and the prior config preserved on failure.
- **Request ID propagation** — every request gets a unique `X-Request-ID` (client-provided or generated UUID). Stored in `AsyncLocalStorage` so all log lines are traceable. Attached to `req.id` for downstream access.
- **Rate limiting** — applied to all routes via `express-rate-limit`. Default: 100 requests per 15 minutes. Configurable via `rate-limit-window-ms` and `rate-limit-max`. Uses standard RFC 9110 headers (`RateLimit-*`).
- **Body validation** — all POST bodies validated with Zod (`validatePostBody()`). Returns 400 if body is missing or not a JSON object. Replaces `req.body` with the validated object.
- **API metrics middleware** — wraps `res.end()` to capture final status code, computes request duration via `process.hrtime()`, records to separate prom-client registry. Exposed at `/metrics`.
- **Graceful shutdown** — 15-second hard timeout safety net. Steps: stop accepting new requests → close HTTP server → close MQTT client (5s timeout) → cleanup settingsStore persistence resources → exit (gauges are in-memory, no flush needed).
- **`log-level` enum includes `warn`** — valid values are `error`, `warn`, `info`, `debug`.
- **Zod v4** — upgraded from Zod v3. Schema uses `z.enum()` with `error` option for custom error messages.
- **ESLint flat config** — `eslint.config.mjs` uses `@typescript-eslint` v8. Rules: `noUnusedLocals`/`noUnusedParameters` via tsconfig, `@typescript-eslint/no-explicit-any: warn`, `@typescript-eslint/no-non-null-assertion: warn`, `@typescript-eslint/consistent-type-imports: warn`.
- **tsconfig.json** — `module: "NodeNext"`, `noUnusedLocals: true`, `noUnusedParameters: true`, `isolatedModules: true`. Excludes `tests/`, `eslint.config.mjs`, `jest.config.ts`, `jest.setup.ts`, `src/dodsonlabs/`.
