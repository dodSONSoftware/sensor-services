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
    ├── package.json       -- Dependencies, scripts, Volta config (Node 18.20.8)
    ├── tsconfig.json      -- ES2016, commonjs, strict mode, outDir: dist
    ├── Dockerfile         -- Two-stage build (Node 22), exposes port 3301
    ├── nodemon.json       -- Dev watch config
    ├── docker-create.sh   -- Build image + run privileged container (Docker socket mounted)
    ├── docker-destroy.sh  -- Stop/remove container and image
    ├── src/
    │   ├── index.ts       -- Entry point: config load, MQTT init, Swagger, middleware, routes, listen
    │   ├── config.json    -- Runtime configuration (MQTT broker, topics, ports)
    │   ├── swagger.ts     -- Swagger UI setup at /swagger
    │   ├── common/
    │   │   └── global.ts  -- Global logger singleton, aboutDude() metadata
    │   ├── controllers/
    │   │   ├── generalController.ts  -- /about, /date_local, /date_utc
    │   │   ├── sensorController.ts   -- MQTT-based sensor command handlers
    │   │   └── pingerController.ts   -- IP Pinger proxy + analyze logic
    │   ├── middleware/
    │   │   └── middleware.ts  -- CORS, JSON parser, request logger
    │   ├── routes/
    │   │   ├── generalRoutes.ts   -- /about, /date_local, /date_utc
    │   │   ├── sensorRoutes.ts    -- /sensors/* (MQTT command routes)
    │   │   ├── pingerRoutes.ts    -- /ippinger/* (proxy routes)
    │   │   └── routeNotFound.ts   -- 404 handler (NOT wired into app)
    │   └── dodsonlabs/          -- Shared library (git submodule from dodson-labs-core)
    │       ├── CreatorBase.ts       -- Abstract RoutesCreatorBase for route creators
    │       ├── Interfaces.ts        -- IAbout, ILogger, IMqttCommandControl, IMqttNetworking, LogLevel
    │       ├── HttpConstants.ts     -- HTTP status codes and MIME types
    │       ├── Logger.ts            -- Console logger with Error/Info/Debug levels
    │       ├── SystemFunctions.ts   -- File I/O, sleep, timestamps, bash exec, error helpers
    │       ├── MqttNetworking.ts    -- MQTT client, telemetry handler, command-response tracker
    │       ├── MqttCommandControl.ts -- Timeout-based state machine for command-response pairs
    │       ├── PrometheusWriter.ts  -- Separate Express server on port 3301 with 10 Prometheus gauges
    │       ├── DBFunctions.ts       -- Entirely commented out (was MariaDB, unused)
    │       └── SensorCreatorBase.ts -- Unused duplicate of CreatorBase
    └── dist/              -- Compiled output (tsc)
```

## Commands

All commands run from the `code/` directory.

```bash
npm run build    # Install deps, compile TypeScript, copy config.json to dist/
npm start        # Run compiled app: node ./dist/index.js
npm run dev      # Hot-reload dev: nodemon --exec ts-node src/index.ts
```

### Docker

```bash
./docker-create.sh   # Build image (sensor-web-services:1.0), run privileged container with Docker socket + config mount
./docker-destroy.sh  # Stop, remove container/image, prune
```

### Notes

- No test framework is configured (no Jest, no test scripts).
- No linting or formatting tooling is configured.
- No CI/CD pipeline exists.
- Uses Volta to pin Node 18.20.8 / npm 10.9.4.

## Architecture

### Overview

This is an Express 4 REST API that bridges IoT weather sensors to HTTP clients and Prometheus. It runs **two HTTP servers**:

1. **Main Express app** on port 32000 (configurable via `EXPRESS_PORT` env var) — serves REST API + Swagger UI
2. **Prometheus metrics server** on port 3301 — exposes `/metrics` with 10 gauges

The app connects to an MQTT broker (`192.168.1.4` by default) for real-time sensor telemetry ingestion and command-response communication.

### Startup Flow (`src/index.ts`)

1. Read config from `/app/dist/config.json` (falls back to hardcoded defaults)
2. Create global `Logger` instance
3. Create `MqttNetworking` instance (connects to MQTT broker, starts PrometheusWriter)
4. Set up Swagger at `/swagger`
5. Create middleware (CORS, JSON parsing, request logger)
6. Register three route groups: `generalRoutes`, `sensorRoutes`, `pingerRoutes`
7. Listen on configured port

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
  "ip-pinger-web-api": "http://192.168.1.4:3300"
}
```

**Env var override:** `EXPRESS_PORT` — main HTTP server port (default 32000)

**Docker config mount:** `docker-create.sh` mounts a host `config.json` into the container at `/app/dist/config.json`.

## Key Patterns and Caveats

- **`dodsonlabs/` is a git submodule** — cloned from a separate GitLab repo (`dodson-labs-core`). See `code/src/git-dodsonlabs-from-cloud.sh` for setup. `code/src/README.txt` has instructions.
- **No authentication or authorization** — middleware only provides CORS, JSON parsing, and request logging.
- **No database** — `DBFunctions.ts` is entirely commented out (was planned MariaDB integration).
- **No tests** — no test framework, no test scripts, no test files.
- **`routeNotFound.ts` exists but is never wired** into the Express app in `index.ts`.
- **`write-config` and `update-config` sensor routes are commented out** in `sensorRoutes.ts` (controller functions exist but routes are disabled).
- **`SensorCreatorBase.ts` is an unused duplicate** of `CreatorBase.ts`.
- **All logging goes to `console.log`** — no file logging, no structured logging, no external log aggregation. `handle_mqtt_message_log()` in MqttNetworking is a TODO stub.
- **Sensor commands use a polling loop** — `sleep(1000)` in a `while(true)` loop checking `is_timed_out`. No async event completion.
- **Reconnection in MqttNetworking uses blocking `sleep()`** — `on_disconnect()` and `on_error()` call `sysFunc.sleep(3000)` before reconnecting, which blocks the event loop.
- **`case_sensitive` is hardcoded to `true`** in `index.ts:70` with a TODO to make it configurable.
- **`node-fetch` is in dependencies but the native `fetch` API is used** instead (Node 18+ built-in).
