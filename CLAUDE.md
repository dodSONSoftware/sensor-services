# Sensor Services — Agent Instructions

## Working directory and scope

Work in `code/` for the Node.js 22 / TypeScript REST service. Keep changes focused; do not modify the separately maintained `code/src/dodsonlabs/` shared-library code casually. Preserve public HTTP/MQTT behavior and fail-fast validation. This service orchestrates sensor commands; sensor telemetry ingestion is a separate service.

## Quick checks

```bash
cd code
npm ci
npm run build
npm run lint
npm test -- --runInBand
npm run blt             # build + lint + 70% coverage thresholds
# Docker-sensitive changes only (Docker daemon required):
bash tests/docker/verify.sh
```

## Non-negotiable change rules

- Validate config using strict Zod schemas; preserve secret redaction and atomic full-document config writes. Only `log-level` hot-reloads.
- New routes require explicit `.register()`, synchronized `__routes` and `__routesHelp`, and drift/Swagger regression checks.
- Preserve middleware ordering, request IDs, low-cardinality metrics, and health/metrics rate-limit exemptions.
- MQTT V3 commands must correlate by `command_id`, release slots on every failure path and return 503 on broker unavailability; write-config must reject broadcast sources.
- Preserve PostgreSQL settings fallback semantics and `X-Settings-Persisted`; keep strict patch rejection.
- Keep shutdown bounded (15s) and Docker stop grace longer (currently 20s).
- Update documentation and relevant tests with behavior/configuration/API changes. Do not claim tests passed without running them.

## Documentation index (authoritative detail)

- [Architecture](docs/ARCHITECTURE.md) — boundaries, API surface, startup, data flows, middleware and deployment.
- [Configuration](docs/CONFIGURATION.md) — YAML schema, precedence, defaults, secrets and reload/write contracts.
- [Engineering decisions](docs/DECISIONS.md) — design tradeoffs and consequences.
- [System invariants](docs/INVARIANTS.md) — behavioral guarantees to preserve.
- [Known issues](docs/KNOWN_ISSUES.md) — verified limitations and deployment risks.
- [Testing](docs/TESTING.md) — test suites, commands, coverage and regression gates.

Implementation and tests remain the final source of truth when documentation and code disagree. Update the documentation to match verified behavior, not assumptions.
