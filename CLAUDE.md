# CLAUDE.md

## Directory Layout

All development happens in `code/`. `src/dodsonlabs/` is a shared library cloned from `http://10.10.10.7:30008/sensor-services/dodson-labs-core.git` (main) — not a git submodule, excluded from ESLint and test coverage.

```
code/
├── src/
│   ├── index.ts         # Entry: config load+validate, logger, MQTT, Swagger, middleware, routes, drift check, listen, shutdown
│   ├── version.ts       # APP_VERSION + APP_NAME (codename per .claude/commands/git-commit.md); kept in sync with package.json
│   ├── config.yml       # Runtime config — single source of truth for ALL configuration, including credentials
│   ├── swagger.ts       # Swagger UI at /swagger (auto-derived from routable IP + port; override via swagger-server-url)
│   ├── common/          # global.ts (logger singleton, AsyncLocalStorage request ID), metrics.ts (API metrics), shutdown.ts (runGracefulShutdown, formatFatalError), app-request.d.ts
│   ├── controllers/     # general, sensor, pinger, log, settings
│   ├── middleware/      # middleware.ts — CreateMiddleware, deliberate order (P3-2)
│   ├── routes/          # general, sensor, pinger, settings, log, config, routeDrift (P3-4), routeNotFound
│   ├── schemas/         # config.ts (Zod v4 + redactConfig), postBody.ts, settings.ts
│   └── services/        # settingsStore.ts (PostgreSQL settings persistence)
└── tests/
    ├── mocks/           # express.ts, mqtt.ts (mock mirrors only the real MqttNetworking surface — P3-10)
    ├── docker/          # verify.sh (P3-8 e2e, needs Docker daemon)
    └── __tests__/       # mirrors src/: common, controllers, middleware, routes, schemas, services, dodsonlabs, docker (static Dockerfile guards), exitCodes
```

## Commands (run from `code/`)

```bash
npm run build          # Compile TypeScript + copy config.yml to dist/
npm start              # node ./dist/index.js
npm run dev            # nodemon hot reload
npm run lint / lint:fix
npm test / test:watch / test:coverage
npm run blt            # CI gate: build && lint && test:coverage (fail if coverage < 70%)

# Docker
docker compose up --build
docker compose down
./docker-refresh.sh            # sync src/config.yml to /mnt/sensor-services/, fresh image, start, tail logs
bash tests/docker/verify.sh    # P3-8 regression
```

Node 22.22.0 / npm 10.9.4 (Volta). CommonJS (`module: "NodeNext"`, no `"type": "module"`). Jest via ts-jest (node env, 70% coverage threshold, excludes `src/dodsonlabs/` and `src/index.ts`). ESLint 9 flat config, `@typescript-eslint` v8 (excludes tests/, dodsonlabs/, jest configs). tsconfig: strict, `noUnusedLocals/Parameters`, `isolatedModules`. No CI/CD pipeline exists.

## Docker (P3-8)

- Builder stage runs the canonical `npm run build`; final image copies only `dist/`, the `src/routes/` subset (Swagger scans it at startup), and `package*.json`; WORKDIR `/app`, non-root `appuser`, HEALTHCHECK on `/health`, exposes 32000.
- Config resolution is identical to bare metal: `/app/configs/config.yml` (docker-compose mounts host `/mnt/sensor-services/` → `/app/configs/`), then CWD fallback `./dist/config.yml`. The mounted config always takes precedence.
- The committed `config.yml` is a complete, independently valid configuration (it carries `db-password`), so a container with no mounted config **starts from the built-in `dist/config.yml`** — pinned by `tests/docker/verify.sh`, which also asserts a mounted config takes precedence over the built-in one.
- Compose sets `stop_grace_period: 20s` — it must exceed the app's hard shutdown timeout (`HARD_SHUTDOWN_TIMEOUT_MS` in `src/common/shutdown.ts`, 15s); Docker's default 10s grace would SIGKILL the process mid-shutdown. Pinned by `tests/__tests__/docker/docker.test.ts`.

## Architecture

Single Express app on port 32000 (REST API + Swagger + API metrics at `/metrics`). MQTT broker provides command-response, info-request, and log traffic; sensor telemetry (and its Prometheus metrics) is handled by sensor-telemetry-service, not this app. PostgreSQL persists UI settings with graceful degradation to in-memory.

**Startup (`src/index.ts`):** read config (`/app/configs/config.yml` → `./dist/config.yml` fallback) via `read_file_yaml()`, validate with `validateConfig()` → create Winston logger (error/warn/info/debug, optional Loki) → `MqttNetworking` → `settingsStore.init()` → `CreateMiddleware` (order P3-2) → Swagger (mounted after middleware) → register route groups → route drift checks (per-module `__routes`↔`__routesHelp`, then `assertRoutesMatchDeclared()` against the live app) → listen → fatal/signal handlers.

**Key components:**

- **MqttNetworking** (dodsonlabs/) — MQTT client (auto-reconnect 5s, `queueQoSZero: false`), subscribes command-response, V3 info-request, and (if `forward-sensor-logs`) log topics; telemetry is handled by sensor-telemetry-service, not here. Command responses tracked by `MqttCommandControl`; only responses matching the active command id are accepted. Outbound dedup via `seen_command_ids` (TTL + size cap). `publish_mqtt_message()` throws on failure.
- **MqttCommandControl** — timeout state machine (default 1500ms, `command-silence-timeout-ms`), event-based `waitForCompletion()` with 10s `AbortController` cap, atomic `claim()` slot serialization.
- **SettingsStore** — PostgreSQL; `init()` only assigns module-level `pool` on full success, so `pool !== null` ⇔ persistence available (`isPersistenceAvailable()`); otherwise real in-memory mode. Updates serialized through a promise queue. Routes: `GET /ui/settings`, `GET /ui/settings-schema`, `PATCH /ui/settings-update`.
- **API metrics** (common/metrics.ts) — separate registry: `http_requests_total`, `http_request_duration_seconds` (buckets 0.01–10s), `http_errors_total`; unmatched routes collapse to the `"unmatched"` label sentinel.

**Sensor command flow:** HTTP → controller → `publish_mqtt_message()` on `iot/v3/command` → sensor replies on `iot/v3/command-response` → `MqttCommandControl` → `waitForCompletion()` → HTTP response with results.

**IPPinger analyze flow:** `/sensors/ippinger-analyze` → live sensors via MQTT `get-details` + pinger `/read-config` via HTTP → `analyzeIt()` classifies OK / IP Address Mismatch / Name Mismatch / Offline / New. Degrades to live sensors + warning when pinger is unreachable.

## API Endpoints

| Area | Routes |
|------|--------|
| General | `GET /about`, `/date_local` (`/date-local`), `/date_utc` (`/date-utc`), `/endpoints`, `/health` (200 healthy/degraded, 503 unhealthy), `/metrics` |
| Settings | `GET /ui/settings`, `GET /ui/settings-schema`, `PATCH /ui/settings-update` |
| Config | `GET /api/reload-config`, `GET /api/read-config`, `POST /api/write-config` |
| Sensors (MQTT) | `GET /sensors/get-details[/:source]`, `GET /sensors/read-config[/:source]`, `POST /sensors/reboot[/:source]` (GET accepted during compatibility period), `POST /sensors/write-config/:source` (rejects broadcast `*` — P1-2), `POST /sensors/update-config/:source` (501, deprecated), `GET /sensors/logs/:source` (Loki; optional `level`, `limit`) |
| Pinger proxy | `/ippinger/{about,read-config,write-config,restart,ping[/:target]}` |
| Pinger analysis | `GET /sensors/ippinger-analyze` (metadata lives in pingerRoutes, P3-4) |
| Swagger | `GET /swagger` |

## Configuration

**Single-file config:** `config.yml` is the only configuration document — the complete application configuration, including credentials (`db-password`, `loki-url`); trusted-LAN deployment assumes access to the file and the config API is controlled by the surrounding infrastructure. Startup and `doReloadConfig()` both read it directly via `read_file_yaml()` + `validateConfig()`; a missing required key (e.g. `db-password`) fails startup with a clear error. `redactConfig()` keeps those values out of logs/Loki; `/api/read-config` returns the complete config and `/api/write-config` consumes the complete document, so read → modify → write round trips preserve every value.

**Required keys:** `express-port`, `log-level` (error/warn/info/debug), `mqtt-broker-ip-address`, `mqtt-topic-command`, `mqtt-topic-command-response`, `ip-pinger-web-api` (http(s) origin `scheme://host[:port]`, no path/trailing `/` — call sites append paths), `case-sensitive`, `db-host`, `db-port`, `db-name`, `db-user`, `db-password`.

**Optional keys:** `sensor-telemetry-api` (same http(s)-origin form as `ip-pinger-web-api`), `swagger-server-url` (absolute http(s) URL; path allowed, credentials rejected), `loki-url` (absolute http(s) URL; path and embedded credentials allowed — it is a secret key), `loki-enabled`, `mqtt-topic-log` (default `iot/v3/log`), `forward-sensor-logs` (default true), `forward-sensor-logs-level` (default debug), `express-body-limit` (default 1mb), `rate-limit-window-ms` / `rate-limit-max` (default 15min/100), `sensor-source-max-length` (default 30), `sensor-source-valid-chars-regex`, `ippinger-fetch-timeout-ms` (default 10000; old `fetch-timeout-ms` accepted as deprecated alias, new key wins — `resolveIppingerFetchTimeoutMs()`), `command-silence-timeout-ms` (default 1500, max 10000 — the 10s HTTP command hard cap), `cors-allowed-origins` (http(s) origins only; absent = no cross-origin browser origin authorized, secure default).

## Key Patterns and Caveats

- **No auth/authz by design** — trusted-LAN deployment; network segmentation is the access boundary (see README "Security and Deployment Assumptions").
- **Middleware order is deliberate (P3-2):** request ID → HTTP metrics → CORS → rate limiting → JSON parser → request logger → body validation. Metrics ahead of the rate limiter is what makes 429s carry `X-Request-ID` and get counted; rate limiting before the JSON parser rejects oversized bodies un-parsed.
- **CORS (P3-5):** `cors({ origin: cors-allowed-origins })`; entries Zod-validated at startup (http(s) origin, no path/credentials). Disallowed origin gets no CORS header; non-browser requests (no `Origin`) unaffected.
- **Settings update is strict (P3-7):** `appSettingsUpdateSchema` is `.strict()` — any unknown key rejects the whole body with 400, nothing applied. `X-Settings-Persisted` header (P3-6) reports `true` (PostgreSQL) / `false` (in-memory degraded); body shape stays the flat merged settings object.
- **MQTT commands fail 503 when broker disconnected** — pre-slot `is_connected()` gate, plus a re-check AFTER acquiring the slot (P2-1): disconnect in the gap → release slot, 503. `publish_mqtt_message()` is async (awaited; `queueQoSZero: false`), so a QoS-0 publish that loses the race with a disconnect rejects asynchronously; that rejection is mapped to `MqttBrokerUnavailableError` (503) and the slot is released immediately — no false success / empty `[]`. Concurrent same-type callers are serialized via `claim()`; each publishes its own command and snapshots its own results.
- **Messages on untracked topics are dropped** (broker is unauthenticated) with a warn. `on_disconnect`/`on_error` rely on mqtt auto-reconnect — no manual reconnection.
- **Route drift is checked at startup (P3-4):** route metadata lives in the module that registers the route; `assertRoutesMatchDeclared()` fails startup if registered ≠ declared (either direction). `routeNotFound` logs unmatched routes at **warn**, not error (P3-3); guards with `if (!res.headersSent)`.
- **Config reload is partial:** only `log-level` is hot-reloadable (`HOT_RELOADABLE_KEYS`, applied via `Logger.setLevel()`); other changes report `restart_keys`. Loki settings never hot-reload (prevents live log exfil). `configController.readConfig()` masks `db-password`/`loki-url`.
- **Config writes are atomic** — `/api/write-config` uses `write_file_atomic()` (same-dir temp + rename).
- **Secrets never reach logs** — `redactSecrets()` (SystemFunctions.ts) recursively masks `SENSITIVE_SECRET_KEYS` (case-insensitive, any depth, no input mutation). Outbound publish logs are sanitized (write-config logs metadata only); the published message is never mutated. `loki-url` is never logged verbatim (may embed credentials).
- **Fatal handlers use `formatFatalError()`** — normalizes non-Error thrown/rejected values via `ensureError()` so they never log as "undefined"; stack kept only for genuine Errors.
- **Graceful shutdown** (`common/shutdown.ts`) — 15s hard timeout (cleared before exit) + re-entrancy guard. Order: stop accepting → close HTTP server → close MQTT (5s timeout) → close settings store → final log → close logger exactly once (Loki transport built with `gracefulShutdown: false`, closed via bounded flush). Exit codes (P2-2): SIGINT/SIGTERM → 0; crashes, fatal startup errors (bad config, EADDRINUSE), hard shutdown timeout → 1.
- **MQTT close (P3-1)** — `clearTimeout()` in a `finally` around the graceful-vs-timeout race so a clean close leaves no live timer forcing a second disconnect.
- **Health probe (P2-3)** — each dependency probe uses `AbortSignal.timeout(2500ms)`, concurrent, well under Docker's 5s deadline; a wedged dependency → `degraded` (still 200), never a down-looking container.
- **V3 MQTT protocol (firmware v4)** — commands use the `message_schema_version: 3` envelope with required `payload`; responses parsed from `payload.command`/`payload.command_id`. `identify` route removed (use `get-details`; sensor IP at `payload.data.network.ip_address`). `update-config` unsupported → 501.
- **write-config rejects broadcast `*` (P1-2)** — including `%2A` and whitespace variants; 400 with no publish. Read commands and reboot legitimately broadcast.
- **feels_like_c** — NOAA/NWS Rothfusz 9-term regression (T ≥ 80°F) with low/high-humidity corrections; preliminary approximation below 80°F, air temperature below 20°C, non-finite inputs → enrichment omits the key.
- **pingerController** — native `fetch` + `AbortSignal.timeout()` (`fetchWithTimeout()`); `validateIpAddress()` rejects private/reserved ranges and URL-injection chars; pinger `/read-config` body is Zod-validated (`ippingerConfigSchema`, camelCase `ipAddress` normalized to kebab `ip-address`) before analysis — an invalid 200 body degrades like an unreachable pinger (must never reach `analyzeIt()` unchecked). `createAnalyzeResult` spreads `origin` (no in-place mutation).
- **logController** — `:source` allowlist-validated (LogQL injection guard), level allowlist, limit default 50 / clamp 100.
- **Request ID** — every request gets `X-Request-ID` (client-provided or UUID) in AsyncLocalStorage + `req.id`; all log lines traceable.
- **Rate limiting** — `/health` and `/metrics` exempt (`skip`) so healthcheck/scrapes can never be 429'd.
- **Body validation** — a present body must be a JSON object (else 400); missing body passes through — "body required" is a route-level concern.
- **`aboutDude()` sys_info** is populated (platform, arch, hostname, uptime, memory). `/health` includes memory/CPU/uptime.
- **Zod v4** (`z.enum()` with `error` option). Winston levels: error/warn/info/debug.

## Tests

`tests/__tests__/` mirrors `src/`: controller/route/middleware/schema/service unit + supertest integration tests (`schemas/configBoundary.test.ts` (P2-1) feeds Zod-accepted values of the runtime-sensitive keys to their real downstream components — node net, pg, body-parser, cors, AbortSignal, MqttCommandControl, template-literal URL call sites, winston-loki), `dodsonlabs/` tests (Logger Loki shutdown ownership, MqttCommandControl with fake timers, MqttNetworking — real mqtt clients against 127.0.0.1 with a registry that force-closes orphaned clients; SystemFunctions), `exitCodes.test.ts` (P2-2, spawns `dist/index.js`; skipped if unbuilt), `routeDrift.test.ts` (P3-4), `swagger.test.ts` (spec contains real route paths), `docker/docker.test.ts` (static P3-8 guards), plus `tests/docker/verify.sh` (e2e). Pinned behavior worth knowing: P3-9 body validation runs through the REAL `CreateMiddleware` (a body with an own `constructor` key → 400), P3-6/P3-7 settings strictness + `X-Settings-Persisted`, P2-4 health/metrics rate-limit exemption.
