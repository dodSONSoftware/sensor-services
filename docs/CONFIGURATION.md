# Sensor Services — Configuration

This document describes settings, defaults, validation and operational semantics for Sensor Services. **`code/src/schemas/config.ts` is the executable authority**; update this document alongside schema or consuming-code changes.

## File resolution and secrets

Startup loads `/app/configs/config.yml` when available, otherwise `./dist/config.yml` relative to the process working directory. `npm run build` copies `src/config.yml` into `dist/`. All settings, including database credentials, are stored in one YAML document. Protect its filesystem access and API access: this trusted-LAN service has no application-level authentication. Never commit real credentials to a public repository; rotate any exposed values. `redactConfig()` masks `db-password`, `loki-url`, and `ip-pinger-config-token` in the startup configuration dump, and the shared `Logger` applies a central two-tier redaction (this service's own secret values, plus recognized sensitive key/value pairs) to every log line; neither masks configuration API responses. Treat `/api/read-config` and `/api/read-running-config` as sensitive endpoints.

### Environment variables

`RESTART_SERVICE_TOKEN` is the only environment variable the application reads, and it is deliberately **not** a `config.yml` key: `/api/read-config` and `/api/read-running-config` return the configuration unredacted, so a config key would expose the token over HTTP. The token gates `POST /restart-service` (graceful self-restart) and is captured once at startup:

- **Validity:** 32+ alphanumeric characters (`openssl rand -hex 32` produces a valid token) — the same rule `ip-pinger-config-token` obeys, but a **distinct** secret: the config token is never accepted by `/restart-service`, and the restart token is never a valid `x-config-token`.
- **Fail-closed, no enable flag:** unset, empty, or set-but-invalid values all disable the endpoint — every request answers the byte-identical `503` and the service runs and boots normally. A bad token can only ever move the endpoint *off*, never crash startup.
- **Secrets never logged:** the token value never reaches any log line in any state; the value is also not part of the `Logger`'s redaction set, so the discipline is "never log it" (pinned by tests).
- **Deployment:** provided to the container via the host environment / a git-ignored `code/.env` (template: `code/.env.example`); compose injects `RESTART_SERVICE_TOKEN=${RESTART_SERVICE_TOKEN:-}`, so an unset host variable arrives empty (disabled). It takes effect only at process start — changing it requires a restart, which is itself a token-gated operation.

## Required keys

| Key | Type / constraint | Purpose |
| --- | --- | --- |
| `express-port` | integer 1–65535 | HTTP listener |
| `log-level` | `error`, `warn`, `info`, `debug` | Winston severity |
| `mqtt-broker-ip-address` | nonempty string | MQTT broker address |
| `mqtt-topic-command` | nonempty string | Publish sensor commands |
| `mqtt-topic-command-response` | nonempty string | Consume command replies |
| `ip-pinger-web-api` | HTTP(S) origin without path, credentials or trailing slash | Pinger API base |
| `case-sensitive` | boolean | Matching policy |
| `db-host`, `db-name`, `db-user`, `db-password` | nonempty strings | PostgreSQL connection |
| `db-port` | integer 1–65535 | PostgreSQL port |

## Optional keys and defaults

| Key | Default / validation |
| --- | --- |
| `sensor-telemetry-api` | Optional HTTP(S) origin, same restriction as pinger origin |
| `ip-pinger-config-token` | Optional; 32+ alphanumeric characters (the ip-pinger config API's acceptance rule, enforced here as fail-fast). Sent as the `x-config-token` header on the pinger `GET /read-config` call behind `/sensors/ippinger-analyze`; leave unset when the pinger's config API is disabled. Restart-only (secret) |
| `swagger-server-url` | Auto-derived from the first non-loopback IPv4 (container-internal under Docker — set this key for container deployments); override permits absolute HTTP(S) URL with path, no credentials |
| `loki-url` | Optional absolute HTTP(S) URL; path and embedded credentials permitted (secret) |
| `loki-enabled` | Optional boolean |
| `mqtt-topic-log` | `iot/v3/log` |
| `forward-sensor-logs` | `true` |
| `forward-sensor-logs-level` | `debug`; `error`/`warn`/`info`/`debug` |
| `express-body-limit` | `1mb`; numeric size with optional `b`, `kb`, `mb`, `gb` suffix |
| `cors-allowed-origins` | Absent: no browser cross-origin origins authorized; array of HTTP(S) origins without path/credentials |
| `rate-limit-window-ms` / `rate-limit-max` | 900000 (15 min) / 100; positive integers |
| `ippinger-fetch-timeout-ms` | 10000; positive integer |
| `fetch-timeout-ms` | Deprecated alias of preceding key; newer key takes precedence |
| `command-silence-timeout-ms` | 1500; positive integer ≤ 10000 (10s hard command cap) |

Configuration uses a **strict** Zod object; unknown keys are rejected, as are missing required keys and malformed value types. The committed `src/config.yml` may override defaults (for example the rate limit and command silence timeout); do not confuse example values with schema defaults.

**Reverse-proxy caveat.** The rate limiter keys each client by `req.ip` (the express-rate-limit default); the service does not configure Express's trust-proxy setting. The current deployment exposes the container port directly, so every client has its own source address and its own `rate-limit-max` budget per window. If a reverse proxy is introduced in front of the service, all clients share the proxy's source address and the entire service shares one budget — configure trust proxy (and the limiter's client-key resolution accordingly, e.g. an `X-Forwarded-For`-based key) before introducing it, or raise `rate-limit-max` to account for the shared addressing.

## Read, write, reload

- `GET /api/read-config` reads the validated **on-disk** file, including pending restart-required changes. `GET /api/read-running-config` returns the active in-memory configuration.
- `POST /api/write-config` validates a full configuration document and persists it via same-directory temporary file + atomic rename, preserving an existing file's permission mode. Do not send partial patches.
- `GET /api/reload-config` only applies `log-level` without restart; all other changed keys are reported as `restart_keys`. Loki configuration is deliberately not hot-reloaded.
- YAML changes to non-hot-reloadable settings require process/container restart. Reload or write operations do not reinitialize MQTT, DB, HTTP, or Loki clients.
- Docker bind-mount access must allow uid/gid 1000 to create and rename temporary files in `/app/configs/`.

## Local validation

From `code/`: `npm run build`, `npm run lint`, `npm test`, or `npm run blt`. Schema rejection and runtime-boundary tests are in `tests/__tests__/schemas/config*.test.ts`.
