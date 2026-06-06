# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Directory Organization

```
/home/worker/Documents/code/sensor-services/sensor-web-services/
├── README.md              -- Project identification (minimal)
├── LICENSE                -- MIT License with Patent Grant
├── NOTICE                 -- Attribution notices
├── THIRD-PARTY-NOTICES.txt
├── .gitignore
└── code/                  -- Application source (all development happens here)
    ├── package.json       -- Dependencies, scripts, Volta config (Node 22.22.0)
    ├── tsconfig.json      -- ES2016, commonjs, strict mode, outDir: dist, excludes tests/
    ├── jest.config.ts     -- Jest config (ts-jest preset, 70% coverage threshold)
    ├── jest.setup.ts      -- Test setup (suppresses console output)
    ├── Dockerfile         -- Two-stage build (Node 22), exposes port 3301
    ├── nodemon.json       -- Dev watch config
    ├── docker-create.sh   -- Build image + run privileged container (Docker socket mounted)
    ├── docker-destroy.sh  -- Stop/remove container and image
    ├── eslint.config.mjs  -- ESLint 9.x flat config (@typescript-eslint v8)
    ├── src/
    │   ├── index.ts       -- Entry point: config load, MQTT init, Swagger, middleware, routes, listen
    │   ├── config.json    -- Runtime configuration (MQTT broker, topics, ports)
    │   ├── swagger.ts     -- Swagger UI setup at /swagger
    │   ├── common/
    │   │   └── global.ts  -- Global logger singleton, aboutDude() metadata
    │   ├── controllers/
    │   │   ├── generalController.ts  -- /about, /date_local, /date_utc, /health
    │   │   ├── sensorController.ts   -- MQTT-based sensor command handlers
    │   │   └── pingerController.ts   -- IP Pinger proxy + analyze logic
    │   ├── middleware/
    │   │   └── middleware.ts  -- CORS, JSON parser, request logger
    │   ├── routes/
    │   │   ├── generalRoutes.ts   -- /about, /date_local, /date_utc, /health
    │   │   ├── sensorRoutes.ts    -- /sensors/* (MQTT command routes)
    │   │   ├── pingerRoutes.ts    -- /ippinger/* (proxy routes)
    │   │   └── routeNotFound.ts   -- 404 handler (wired into app)
    │   └── dodsonlabs/          -- Shared library (git submodule from dodson-labs-core)
    │       ├── CreatorBase.ts       -- Abstract RoutesCreatorBase for route creators
    │       ├── Interfaces.ts        -- IAbout, ILogger, IMqttCommandControl, IMqttNetworking, LogLevel
    │       ├── HttpConstants.ts     -- HTTP status codes and MIME types
    │       ├── Logger.ts            -- Console logger with Error/Info/Debug levels
    │       ├── SystemFunctions.ts   -- File I/O, sleep, timestamps, bash exec, error helpers
    │       ├── MqttNetworking.ts    -- MQTT client, telemetry handler, command-response tracker
    │       ├── MqttCommandControl.ts -- Timeout-based state machine for command-response pairs
    │       └── PrometheusWriter.ts  -- Separate Express server on port 3301 with 10 Prometheus gauges
    ├── tests/
    │   ├── mocks/
    │   │   ├── express.ts   -- createMockRes(), createMockReq() helpers
    │   │   └── mqtt.ts      -- createMockMqttNetworking() helper
    │   └── __tests__/
    │       ├── controllers/
    │       │   ├── generalController.test.ts  -- /about, /date_local, /date_utc, /health
    │       │   ├── sensorController.test.ts   -- create_mqtt_command_message()
    │       │   └── pingerController.test.ts   -- analyzeIt(), createAnalyzeResult()
    │       ├── routes/
    │       │   ├── generalRoutes.test.ts      -- Integration tests via supertest
    │       │   └── routeNotFound.test.ts      -- 404 handler tests
    │       └── dodsonlabs/
    │           ├── MqttCommandControl.test.ts -- State machine tests (fake timers)
    │           └── SystemFunctions.test.ts    -- ensureError(), formatElapsedTime(), log level converters
    └── dist/              -- Compiled output (tsc)
```

## Commands

All commands run from the `code/` directory.

```bash
npm run build          # Install deps, compile TypeScript, copy config.json to dist/
npm start              # Run compiled app: node ./dist/index.js
npm run dev            # Hot-reload dev: nodemon --exec ts-node src/index.ts
npm run lint           # ESLint 9.x check (eslint.config.mjs, @typescript-eslint v8)
npm run lint:fix       # ESLint auto-fix
npm test               # Jest test runner
npm run test:watch     # Jest watch mode
npm run test:coverage  # Jest with coverage report
```

### Docker

```bash
./docker-create.sh   # Build image (sensor-web-services:1.0), run privileged container with Docker socket + config mount
./docker-destroy.sh  # Stop, remove container/image, prune
```

### Notes

- Jest configured via `jest.config.ts` (ts-jest preset, node environment, 70% coverage threshold).
- ESLint 9.x configured via `eslint.config.mjs` with `@typescript-eslint` v8.
- No CI/CD pipeline exists.
- Uses Volta to pin Node 22.22.0 / npm 10.9.4.
- `dodsonlabs/` is excluded from ESLint and test coverage (shared submodule library).
- `index.ts` and `swagger.ts` are excluded from test coverage (bootstrap code).

## Architecture

### Overview

This is an Express 4 REST API that bridges IoT weather sensors to HTTP clients and Prometheus. It runs **two HTTP servers**:

1. **Main Express app** on port 32000 (configurable via `EXPRESS_PORT` env var) — serves REST API + Swagger UI
2. **Prometheus metrics server** on port 3301 — exposes `/metrics` with 10 gauges

The app connects to an MQTT broker (`192.168.1.4` by default) for real-time sensor telemetry ingestion and command-response communication.

### Startup Flow (`src/index.ts`)

1. Read config from `/app/dist/config.json` (falls back to `./dist/config.json`)
2. Validate config: required string keys (`mqtt-broker-ip-address`, `mqtt-topic-telemetry`, `mqtt-topic-command`, `mqtt-topic-command-response`, `ip-pinger-web-api`), MQTT broker IP format, ip-pinger URL format, required number key (`prometheus-port`), required boolean key (`case-sensitive`)
3. Create global `Logger` instance via `createLogger(config)`
4. Create `MqttNetworking` instance (connects to MQTT broker, starts PrometheusWriter)
5. Get port from `EXPRESS_PORT` env var (default 32000)
6. Set up Swagger at `/swagger` (server URL from config `swagger-server-url` or auto-derived from machine IP + port)
7. Create middleware (CORS, JSON parsing, request logger)
8. Register route groups: `generalRoutes`, `sensorRoutes`, `pingerRoutes`, `routeNotFound`
9. Listen on configured port
10. Register graceful shutdown handlers for `SIGTERM`/`SIGINT` — closes HTTP server, then calls `networking.close()`

### Core Components

**MqttNetworking** (`dodsonlabs/MqttNetworking.ts`) — The central sensor networking class:
- Connects to MQTT broker with auto-reconnect (5s reconnectPeriod, 10s connectTimeout)
- Subscribes to `iot/telemetry` and `iot/v2/command-response` topics
- Dispatches incoming messages by `message-type`: `telemetry`, `log`, `command-response`
- Telemetry messages are parsed and forwarded to `PrometheusWriter.publish_*` methods
- Command responses are tracked via `MqttCommandControl` state machines (1.5s timeout)
- Exposes `publish_mqtt_message()` for sending commands to sensors

**PrometheusWriter** (`dodsonlabs/PrometheusWriter.ts`) — Metrics server:
- Runs a separate Express server on configurable port (default 3301)
- Exposes 10 Gauge metrics labeled by `source`:
  - `Air_Temperature` (F), `Air_Humidity` (%), `Air_Pressure` (in/Hg)
  - `Light_UV_Index`, `Light_LUX`
  - `Rain_In_H2O` (inches)
  - `Wind_Speed` (mph), `Wind_Gusts` (mph)
  - `Water_Temperature` (F)
  - `Lightning` (count)
- Performs unit conversions: Celsius to Fahrenheit, cm/sec to mph, pascals to in/Hg

**MqttCommandControl** (`dodsonlabs/MqttCommandControl.ts`) — Timeout-based state machine:
- Tracks async MQTT command-response pairs
- Default timeout: 1500ms
- Polling loop in `sensorController.ts` checks `is_timed_out` every 1 second

**RoutesCreatorBase** (`dodsonlabs/CreatorBase.ts`) — Abstract base class:
- All route modules extend this: `CreateGeneralRoutes`, `CreateSensorRoutes`, `CreatePingerRoutes`
- Constructor calls abstract `createRoutes()` method

### Data Flows

**Telemetry (MQTT → Prometheus):**
```
Sensor → MQTT broker (iot/telemetry) → MqttNetworking.handle_mqtt_message_telemetry()
  → PrometheusWriter.publish_air/light/rain/wind/water/lightning()
  → Gauge.set({ source }, value) → /metrics endpoint (port 3301)
```

**Sensor Commands (HTTP → MQTT → Response):**
```
HTTP GET /sensors/identify → sensorController → mqtt_command_get_messages()
  → MqttNetworking.publish_mqtt_message(topic: iot/v2/command, msg)
  → Sensor processes command, responds on iot/v2/command-response
  → MqttNetworking.handle_mqtt_message_command_response() → MqttCommandControl.results[]
  → Polling loop (sleep 1000ms) waits for is_timed_out
  → HTTP response returns MqttCommandControl.results
```

**IP Pinger Proxy (HTTP → External Service):**
```
HTTP GET /ippinger/ping → pingerController.fetchIt() → fetch() → http://192.168.1.4:3300/ping → response
```

**IP Pinger Analysis (HTTP → MQTT + HTTP → Merge):**
```
HTTP GET /ippinger/analyze-ippinger → getAnalyzeIpPinger()
  → mqtt_command_get_messages(network, "*", "identify")  [fetch live sensors via MQTT]
  → fetchItOnly("http://192.168.1.4:3300/read-config")   [fetch pinger config via HTTP]
  → analyzeIt(sensors, ippinger_devices, case_sensitive)  [compare and classify]
  → Results: "OK", "IP Address Mismatch", "Name Mismatch", "Offline", "New"
```

## API Endpoints

### General Routes (no prefix)

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/about` | API metadata, version, commands list |
| GET | `/date_local` | Current local date/time (`yyyy-mm-ddThh:mm:ss`) |
| GET | `/date_utc` | Current UTC date/time (`yyyy-mm-ddThh:mm:ssZ`) |
| GET | `/health` | Health status with MQTT connectivity (`mqtt_connected` from request property) |

### Sensor Routes (`/sensors`) — MQTT-based

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/sensors/identify` | Identify all sensors via MQTT |
| GET | `/sensors/identify/:source` | Identify a specific sensor |
| GET | `/sensors/get-details` | Get details for all sensors |
| GET | `/sensors/get-details/:source` | Get details for a specific sensor |
| GET | `/sensors/reboot` | Reboot all sensors (MQTT command) |
| GET | `/sensors/reboot/:source` | Reboot a specific sensor |
| GET | `/sensors/read-config` | Read config from all sensors |
| GET | `/sensors/read-config/:source` | Read config from a specific sensor |
| POST | `/sensors/write-config/:source` | Write config to a specific sensor (MQTT command) |
| POST | `/sensors/update-config/:source` | Update config on a specific sensor (MQTT command) |

### IP Pinger Routes (`/ippinger`) — Proxy to external service

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/ippinger/about` | Proxy to IP pinger service `/about` |
| GET | `/ippinger/read-config` | Proxy to IP pinger service `/read-config` |
| POST | `/ippinger/write-config` | POST to IP pinger service `/write-config` |
| POST | `/ippinger/restart` | POST to IP pinger service `/restart` |
| GET | `/ippinger/ping` | Proxy to IP pinger service `/ping` |
| GET | `/ippinger/ping/:target` | Proxy to IP pinger service `/ping/{ip}` |
| GET | `/ippinger/analyze-ippinger` | Compare pinger config against live sensors |

### Prometheus Metrics (port 3301)

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/metrics` | Prometheus scrape endpoint (all 10 gauges) |

### Swagger

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/swagger` | Swagger UI (OpenAPI 3.0, scans `src/routes/**/*.ts` for JSDoc) |

## Configuration

**File:** `code/src/config.json`

```json
{
  "log-level": "debug",
  "prometheus-port": 3301,
  "mqtt-broker-ip-address": "192.168.1.4",
  "mqtt-topic-telemetry": "iot/telemetry",
  "mqtt-topic-command": "iot/v2/command",
  "mqtt-topic-command-response": "iot/v2/command-response",
  "ip-pinger-web-api": "http://192.168.1.4:3300",
  "case-sensitive": true
}
```

**Optional config key:** `swagger-server-url` — overrides auto-derived Swagger server URL (from machine IP + port). Not set by default.

**Env var override:** `EXPRESS_PORT` — main HTTP server port (default 32000)

**Docker config mount:** `docker-create.sh` mounts a host `config.json` into the container at `/app/dist/config.json`.

## Key Patterns and Caveats

- **`dodsonlabs/` is a git submodule** — cloned from `http://192.168.1.5:30008/sensor-services/dodson-labs-core.git`. Run `code/src/git-dodsonlabs-from-cloud.sh` for setup. `code/src/README.txt` has instructions.
- **No authentication or authorization** — middleware only provides CORS, JSON parsing, and request logging.
- **No CI/CD pipeline** — no GitHub Actions, GitLab CI, or other automation.
- **All logging goes to `console.log`** — no file logging, no structured logging, no external log aggregation. `handle_mqtt_message_log()` in MqttNetworking is a TODO stub (references Loki integration).
- **Sensor commands use a polling loop** — `sleep(1000)` in an `async` loop checking `is_timed_out`. No async event completion.
- **`on_disconnect()` and `on_error()` rely on the mqtt library's auto-reconnect** — manual reconnection was removed (created race conditions). The `reconnectPeriod: 5000` handles reconnection automatically.
- **Native `fetch` API is used** (Node 18+ built-in) — `node-fetch` was removed from dependencies.
- **`swagger-server-url` is configurable** via `config.json` (falls back to auto-derived from machine IP + port).
- **`case-sensitive` is configurable** via `config.json` (used by `analyzeIt()` in pingerController).
- **`write-config` and `update-config` sensor routes are active** POST endpoints in `sensorRoutes.ts`.
- **`routeNotFound.ts` is wired** into the app via `new CreateRouteNotFound(app)` in `index.ts`.
- **`prometheus-port` and `case-sensitive` are validated at startup** — `prometheus-port` must be a positive integer, `case-sensitive` must be a boolean.
- **`formatElapsedTime()` is used** in graceful shutdown logging (`Uptime: ${formatElapsedTime(...)}`).
- **`sys_info` array in `aboutDude()` is always empty** — has a TODO to populate with system information (OS, uptime, etc.).
- **`docker-create.sh` runs a privileged container** with Docker socket mounted — a security concern for production use.
- **`__routesHelp` objects in each route file** are the single source of truth for the `/about` command list, but there's no validation that the routes actually exist for each entry — easy to get out of sync.
- **`createAnalyzeResult` mutates its `origin` argument in-place** — callers should not assume the object is unchanged after the call.
- **`pingerController.ts` has two fetch patterns** — `fetchIt()`/`postIt()` use promise chains with `.then()`/`.catch()` (fire-and-forget to `res`), while `fetchItOnly()` uses `async/await` for composability (used in `getAnalyzeIpPinger`).

## Resolved Issues (from `to-fix.md`, deleted)

The following issues from the old `to-fix.md` have been resolved:

- **Blocking `sleep()` in MQTT reconnect** — removed; mqtt library's `reconnectPeriod: 5000` handles reconnection.
- **`routeNotFound.ts` never wired** — now instantiated via `new CreateRouteNotFound(app)` in `index.ts`.
- **`case_sensitive` hardcoded to `true`** — moved to `config.json` as `case-sensitive`.
- **`swagger-server-url` hardcoded** — now configurable via `config.json` (`swagger-server-url`).
- **`write-config`/`update-config` commented out** — now active POST endpoints.
- **No test framework** — Jest + ts-jest configured with 8 test suites, 70% coverage threshold.
- **No linting** — ESLint 9.x with flat config and `@typescript-eslint` v8.
- **`formatElapsedTime` unused** — now used in graceful shutdown uptime logging.
- **`node-fetch` unused** — removed from dependencies; native `fetch` used throughout.
- **`SensorCreatorBase.ts` duplicate** — removed (consolidated into `CreatorBase.ts`).
- **`swagger-server-url` hardcoded to `192.168.1.214`** — now auto-derived or configurable.
