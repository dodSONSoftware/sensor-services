# Sensor Services — Testing

This document defines the validation workflow and regression coverage expected for Sensor Services. Run commands from `code/` unless stated otherwise.

## Toolchain and local commands

Node 22.22.0 and npm 10.9.4 are specified through Volta. TypeScript runs in strict NodeNext/CommonJS mode; Jest 29 uses `ts-jest` and Node test environment; ESLint 9 uses flat config.

```bash
cd code
npm ci
npm run build
npm run lint
npm test -- --runInBand
npm run test:coverage -- --runInBand
npm run blt
# Requires Docker daemon and a working container build:
bash tests/docker/verify.sh
```

`npm run blt` performs build → lint → coverage suite. Jest enforces **70% minimum separately for branches, functions, lines and statements**, globally across application `src/**/*.ts` excluding `src/dodsonlabs/**` and `src/index.ts`. Shared-library tests still run; exclusion affects coverage accounting only. Docker verification is separate from BLT.

## Test layout and scenarios

| Area | Test location | Primary coverage |
| --- | --- | --- |
| API, controllers and routes | `tests/__tests__/controllers/`, `routes/` | REST status codes, validation, MQTT commands, pinger proxy and analysis, route registration |
| Middleware | `tests/__tests__/middleware/` | Request ID, order, CORS, rate limits, body handling, metrics |
| Configuration | `tests/__tests__/schemas/config.test.ts`, `configBoundary.test.ts` | Strict Zod schema, downstream integration of accepted key values |
| Settings | `tests/__tests__/services/`, `controllers/settingsController.test.ts` | DB availability, serialization, fallback, strict updates, persistence reporting |
| MQTT, logging and utilities | `tests/__tests__/dodsonlabs/` | Broker disconnect/command correlation, timeout, secret sanitation and transport lifetime |
| Lifecycle and metrics | `tests/__tests__/common/`, `exitCodes.test.ts` | Prometheus counters, health/shutdown, process exits (compiled build required) |
| Swagger and drift | `tests/__tests__/swagger.test.ts`, `routes/routeDrift.test.ts` | Declared routes vs registered routes and generated API spec |
| Packaging | `tests/__tests__/docker/docker.test.ts`, `tests/docker/verify.sh` | Static Docker contract and runtime mount/fallback behavior |

## Change gates

- For changed route: update route metadata/help alongside implementation, then run route, Swagger and drift tests.
- For changed config: update Zod schema, supplied YAML and `docs/CONFIGURATION.md`; run config and config-boundary tests, build and deployment tests if paths/ports change.
- For MQTT protocol/commands: test correlation, concurrent slot behavior, disconnect-before/after-claim, publish rejection, timers and cleanup.
- For database settings: test durable success, degraded in-memory updates and DB query failure without cache mutation.
- For middleware: verify request IDs and metrics still cover 429s, and health/metrics are exempt.
- For shutdown/Docker: verify signal and fatal exit codes, resource close order, container stop grace and runtime fallback config.
- For any production change: `npm run blt`; run Docker verification when image/deployment behavior changes.

## Execution evidence

These commands are prescribed checks, not evidence of successful execution. Record actual environment, command, result and failures in change/PR notes. A passing unit suite does not prove MQTT/PostgreSQL/Loki are reachable in deployment.
