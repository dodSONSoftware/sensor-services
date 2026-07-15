# Typescript Sensor Web Services

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.1+-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-22.22.0-green.svg)](https://nodejs.org/)

> **dodson labs** &mdash; A RESTful web service connecting IoT weather sensors to HTTP clients and Prometheus monitoring.

---

## Overview

The Typescript Sensor Web Services project provides an Express-based REST API for IoT sensor monitoring with:

- **MQTT integration** for real-time sensor telemetry ingestion and command-response communication
- **PostgreSQL-backed settings persistence** for application configuration
- **Prometheus metrics** for both API observability and sensor gauges
- **Swagger UI** for interactive API discovery

---

## Version

**Current:** v4.7.0

See git history for release notes.

---

## Quick Start

### Prerequisites

- Node.js 22.22.0 (managed via Volta)
- npm 10.9.4
- PostgreSQL (for settings persistence)
- MQTT broker (e.g., Mosquitto)

### Installation

```bash
cd code

# Install dependencies
npm install

# Build TypeScript
npm run build
```

### Configuration

Create a `config.yml` file in `src/` or mount it at runtime:

```yaml
# Main HTTP server port
express-port: 32000

# Logging (error, warn, info, debug)
log-level: debug

# Prometheus metrics server port
prometheus-port: 3301

# MQTT broker connection
mqtt-broker-ip-address: "10.10.10.64"
mqtt-topic-telemetry: "iot/telemetry"
mqtt-topic-command: "iot/v2/command"
mqtt-topic-command-response: "iot/v2/command-response"

# External services
ip-pinger-web-api: "http://<ip-pinger-host>:<port>"

# Behavior
case-sensitive: true

# Database (for settings persistence)
db-host: "<db-host>"
db-port: <db-port>
db-name: "<db-name>"
db-user: "<db-user>"
db-password: "<db-password>"
```

### Running Locally

```bash
# Development mode with hot reload
npm run dev

# Production mode
npm start
```

The API will be available at `http://localhost:32000`.

---

## Docker

```bash
# Build and run with docker-compose
docker compose up --build

# Stop the container
docker compose down
```

The Docker Compose configuration mounts `config.yml` from the host into the container at `/app/configs/config.yml`.

---

## API Endpoints

### General Routes

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/about` | API metadata, version, commands list, system info |
| GET | `/date_local`, `/date-local` | Current local date/time |
| GET | `/date_utc`, `/date-utc` | Current UTC date/time |
| GET | `/endpoints` | Detailed information about each API endpoint |
| GET | `/health` | Health status with MQTT, memory, CPU, uptime |
| GET | `/metrics` | Prometheus scrape endpoint for API metrics |

### Sensor Routes (`/sensors/*`)

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/sensors/identify` | Identify all sensors via MQTT |
| GET | `/sensors/identify/:source` | Identify a specific sensor |
| GET | `/sensors/get-details` | Get details for all sensors |
| GET | `/sensors/get-details/:source` | Get details for a specific sensor |
| POST | `/sensors/reboot` | Reboot all sensors (returns command metadata) |
| POST | `/sensors/reboot/:source` | Reboot a specific sensor (returns command metadata) |
| GET | `/sensors/read-config` | Read config from all sensors |
| GET | `/sensors/read-config/:source` | Read config from a specific sensor |
| POST | `/sensors/write-config/:source` | Write config to a specific sensor |
| POST | `/sensors/update-config/:source` | Update config on a specific sensor |

### IP Pinger Routes (`/ippinger/*`)

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/ippinger/about` | Proxy to IP pinger service `/about` |
| GET | `/ippinger/read-config` | Proxy to IP pinger service `/read-config` |
| POST | `/ippinger/write-config` | POST to IP pinger service `/write-config` |
| POST | `/ippinger/restart` | POST to IP pinger service `/restart` |
| GET | `/ippinger/ping` | Proxy to IP pinger service `/ping` |
| GET | `/ippinger/ping/:target` | Proxy to IP pinger service `/ping/{ip}` |
| GET | `/ippinger/analyze-ippinger` | Compare pinger config against live sensors |

### Settings Routes (`/ui/settings`)

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/ui/settings` | All application settings |
| GET | `/ui/settings-schema` | Setting definitions with name, default, range, and description |
| PATCH | `/ui/settings-update` | Partial update of settings |

### Swagger

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/swagger` | Interactive Swagger UI |

---

## Commands

All commands run from the `code/` directory.

```bash
npm run build          # Compile TypeScript, copy config.yml to dist/
npm start              # Run compiled app (production)
npm run dev            # Hot-reload development server
npm run lint           # ESLint check
npm run lint:fix       # ESLint auto-fix
npm test               # Jest tests
npm run test:watch     # Jest watch mode
npm run test:coverage  # Jest with coverage report
npm run blt            # CI check: build + lint + test
```

---

## Project Structure

```
code/
├── src/
│   ├── index.ts              # Entry point, DI bootstrap, route registration
│   ├── config.yml            # Runtime configuration
│   ├── common/               # Shared utilities (logger, metrics)
│   ├── controllers/          # HTTP request handlers
│   ├── middleware/           # Express middleware
│   ├── routes/               # Route definitions
│   ├── schemas/              # Zod validation schemas
│   ├── services/             # Business logic (settings store)
│   └── dodsonlabs/           # Shared library
├── tests/
│   └── __tests__/            # Jest test suites
└── dist/                     # Compiled output
```

---

## Architecture Highlights

- **Event-based MQTT responses**: Uses `MqttCommandControl.waitForCompletion()` with configurable timeout and 10-second hard cap
- **Separate metric registries**: API metrics (requests, duration, errors) isolated from sensor gauge metrics
- **Graceful shutdown**: 15-second timeout, closes HTTP server then MQTT client
- **Request tracing**: `X-Request-ID` header propagated via AsyncLocalStorage
- **Rate limiting**: Configurable
- **Body validation**: All POST bodies validated with Zod schemas

---

## Testing

```bash
# Run all tests
npm test

# With coverage report
npm run test:coverage
```

Tests use Jest with ts-jest preset. Coverage threshold: 70%.

---

## Linting

```bash
npm run lint        # Check code style
npm run lint:fix    # Auto-fix where possible
```

Uses ESLint 9.x with @typescript-eslint v8.

---

## License

[MIT License](./LICENSE) © 2026 dodson labs

---

## See Also

- [CLAUDE.md](./CLAUDE.md) — Detailed architecture and development guide
- [Swagger UI](http://localhost:32000/swagger) — Interactive API documentation (run locally)
