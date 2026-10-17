# Sensor Services — Architecture

This document describes the architecture, components, interfaces, and data flows of Sensor Services. It is the reference for system structure and design boundaries.

## Scope and topology

`code/` contains a Node.js 22 / TypeScript Express 4 application. `code/src/index.ts` is the composition root; `src/dodsonlabs/` is a separately maintained shared library checked into the source tree, not a Git submodule. Sensor Services provides a REST API, Swagger UI, API Prometheus metrics, MQTT command orchestration, IP-pinger proxy/analysis and PostgreSQL-backed UI settings. **Sensor telemetry ingestion and sensor measurements are owned by the separate sensor-telemetry service**, not this process.

External dependencies: MQTT broker (V3 sensor protocol), PostgreSQL (`settingsStore`), optional Loki logging/query endpoint, IP-pinger HTTP API, optional sensor-telemetry API. REST listens on the configured `express-port` (the supplied config uses 32000); Swagger is at `/swagger` and metrics at `/metrics`.

## Source boundaries

| Path | Responsibility |
| --- | --- |
| `src/index.ts` | Startup composition, registration, route assertions, listen, termination handlers |
| `src/middleware/middleware.ts` | Request ID, API metrics, CORS, rate limiting, JSON body parsing, logging and validation |
| `src/routes/` | HTTP route registration and declared route/help metadata |
| `src/controllers/` | Endpoint orchestration, MQTT commands, pinger access, configuration and log queries |
| `src/schemas/` | Zod v4 validation for configuration, requests and settings |
| `src/services/settingsStore.ts` | PostgreSQL settings cache and in-memory fallback |
| `src/common/` | Shared request context, Prometheus API metrics, shutdown sequence |
| `src/dodsonlabs/` | Shared MQTT transport, command state machine, logger, utility functions |
| `database/` | Schema and settings migration SQL |
| `tests/` | Unit/integration tests, mocks and Docker verification |

## Lifecycle

1. Load YAML from `/app/configs/config.yml` if present, otherwise `./dist/config.yml`; enforce the strict Zod schema.
2. Set up Winston (optionally Loki), MQTT networking and settings persistence. An unavailable database permits in-memory settings operation.
3. Register middleware, Swagger and every route class through explicit `register()` calls. Register not-found handling last.
4. Compare each route module's `__routes` and `__routesHelp`; verify declared HTTP routes equal live Express routes. Drift fails startup.
5. Start the HTTP listener and install signal/fatal handlers. Shutdown closes HTTP, MQTT, settings and logger in order with a hard 15-second deadline. The HTTP step is bounded independently: `server.close()` is paired with a ~4-second grace after which `closeAllConnections()` force-closes in-flight and idle keep-alive connections, so the step cannot consume the whole budget (an in-flight command plus the Node 22 keep-alive idle drain used to exceed 15s on its own).

## HTTP surface

| Domain | Routes |
| --- | --- |
| General | `GET /about`, `/date_local`, `/date-local`, `/date_utc`, `/date-utc`, `/endpoints`, `/health`, `/metrics` |
| UI | `GET /ui/settings`, `/ui/settings-schema`; `PATCH /ui/settings-update` |
| Config | `GET /api/read-config`, `/api/read-running-config`, `/api/reload-config`; `POST /api/write-config` |
| Sensor commands | `GET /sensors/get-details[/:source]`, `/sensors/read-config[/:source]`; `POST /sensors/reboot[/:source]`, `/sensors/write-config/:source`; deprecated `/sensors/update-config/:source` returns 501 |
| Sensor logs | `GET /sensors/logs/:source` |
| Pinger | `GET /sensors/ippinger-analyze` |
| Docs | `GET /swagger` |

`GET /sensors/reboot[/:source]` remains a compatibility route. See each `src/routes/*Routes.ts` for HTTP methods, metadata, and handler bindings; do not treat this summary as a replacement for those declarations.

## Command and analysis flows

HTTP sensor command → sensor controller → `MqttCommandControl.claim()` → awaited QoS-0 publish on configured V3 command topic → matching `command_id` reply on command-response topic → bounded result collection → HTTP response. Disconnected publish paths return 503 and release the slot; calls of the same command type are serialized. Protocol V3 messages have `message_schema_version: 3` and a `payload` envelope.

`GET /sensors/ippinger-analyze` combines live MQTT `get-details` with the pinger's validated HTTP `/read-config` response. The `/read-config` fetch carries the `x-config-token` header when `ip-pinger-config-token` is configured (restart-only); it is omitted otherwise. It categorizes OK, IP Address Mismatch, Name Mismatch, Offline and New entries. Invalid or unavailable pinger data produces a warning/degraded analysis based on live sensors, rather than feeding unchecked input into the analyzer; a token rejection (401) and a disabled pinger config API (503) degrade with distinct warnings naming the cause.

## Middleware and observability

The order is intentional: request ID → HTTP metrics → CORS → rate limit → JSON parser → request logger → body validation. `X-Request-ID` is correlated via AsyncLocalStorage. Rate-limit-exempt `/health` and `/metrics` remain scrapeable; unmatched paths use a bounded `unmatched` route label. API metrics are `http_requests_total`, `http_request_duration_seconds`, `http_errors_total` in a separate Prometheus registry. The `/health` handler uses concurrent 2.5-second dependency probes and returns 200 for degraded health, 503 for unhealthy status. All application log output passes through a central two-tier secret redaction in the shared `Logger` (the `write_*` seam) before reaching the console or Loki transports; caller-side sanitization remains as defense in depth.

## Container deployment

`code/Dockerfile` compiles via `npm run build` in a builder stage. Runtime uses non-root `node` (uid/gid 1000), copying compiled output and the route sources Swagger needs to scan. `code/docker-compose.yml` publishes port 32000, mounts `/mnt/sensor-services/` to `/app/configs/`, and configures 20-second stop grace (> the app's 15-second shutdown cap). Mounted config takes priority; a built-in compiled config is the fallback. See `code/tests/docker/verify.sh` for a runtime regression check.
