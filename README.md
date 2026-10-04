# Typescript SensorNET Services

Series 1 - SensorNET Services

**Release:** Carbon Falcon — firmware 4.12.0

[![Dodson Labs](https://img.shields.io/badge/dodson%20labs-2026-purple?labelColor=gray)](https://github.com/dodSONSoftware)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.1+-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-22.22.0-green.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> **dodson labs** &mdash; A RESTful web service connecting IoT weather sensors to HTTP clients and Prometheus monitoring.

---

## Overview

The Typescript SensorNET Services project provides an Express-based REST API for IoT sensor monitoring with:

- **MQTT integration** for real-time sensor telemetry ingestion and command-response communication
- **PostgreSQL-backed settings persistence** for application configuration
- **Prometheus metrics** for both API observability and sensor gauges
- **Swagger UI** for interactive API discovery

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
mqtt-topic-telemetry: "iot/v3/telemetry"
mqtt-topic-command: "iot/v3/command"
mqtt-topic-command-response: "iot/v3/command-response"

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
| GET | `/about` | API metadata (name, version, codename, author), available commands list, and system info (platform, arch, hostname, uptime, memory) |
| GET | `/date_local`, `/date-local` | Current local date/time |
| GET | `/date_utc`, `/date-utc` | Current UTC date/time |
| GET | `/endpoints` | Detailed information about each API endpoint |
| GET | `/health` | Health status with MQTT, memory, CPU, uptime — HTTP 200 for healthy/degraded, HTTP 503 for unhealthy |
| GET | `/metrics` | Prometheus scrape endpoint for API metrics |

### Sensor Routes (`/sensors/*`)

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/sensors/get-details` | Get details for all sensors |
| GET | `/sensors/get-details/:source` | Get details for a specific sensor |
| POST | `/sensors/reboot` | Reboot all sensors (returns command metadata; firmware resets ~5s after responding). POST is canonical; GET is accepted during the compatibility period |
| POST | `/sensors/reboot/:source` | Reboot a specific sensor (returns command metadata). POST is canonical; GET is accepted during the compatibility period |
| GET | `/sensors/read-config` | Read config from all sensors |
| GET | `/sensors/read-config/:source` | Read config from a specific sensor |
| POST | `/sensors/write-config/:source` | Write the complete config to a specific sensor |
| POST | `/sensors/update-config/:source` | Deprecated — returns 501; firmware v4 has no partial update, use write-config |
| GET | `/sensors/logs/:source` | Fetch sensor logs from Loki (source is allowlist-validated; `level` filter: debug/info/warn/error, `limit` max 100) |

### IP Pinger Routes (`/ippinger/*`)

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/ippinger/about` | Proxy to IP pinger service `/about` |
| GET | `/ippinger/read-config` | Proxy to IP pinger service `/read-config` |
| POST | `/ippinger/write-config` | POST to IP pinger service `/write-config` |
| POST | `/ippinger/restart` | POST to IP pinger service `/restart` |
| GET | `/ippinger/ping` | Proxy to IP pinger service `/ping` |
| GET | `/ippinger/ping/:target` | Proxy to IP pinger service `/ping/{ip}` |

### Sensor Routes (`/sensors/*`) - Analysis

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/sensors/ippinger-analyze` | Compare pinger config against live sensors |

### Settings Routes (`/ui/settings`)

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/ui/settings` | All application settings |
| GET | `/ui/settings-schema` | Setting definitions with name, default, range, and description |
| PATCH | `/ui/settings-update` | Partial update of settings |

### Configuration Routes (`/api/*`)

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/reload-config` | Reload configuration from disk; only `log-level` applies immediately — other changed keys are reported as restart-required (`restart_required`, `restart_keys`) |
| GET | `/api/read-config` | Read the running (in-memory) configuration as JSON; secrets (`db-password`, `loki-url`) are masked |
| POST | `/api/write-config` | Save new configuration and reload; only `log-level` applies immediately, other changed keys are reported as restart-required |

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

## Security and Deployment Assumptions

> The configuration API does not implement application-level authentication. This service is designed for deployment only on a trusted, private LAN and must not be exposed directly to the public Internet. Network segmentation and firewall rules are the security boundary for access to configuration endpoints.

### Accepted risk

Endpoints such as `POST /api/write-config`, `GET /api/reload-config`, and `GET /api/read-config` are reachable by any client that can reach the service on the trusted LAN. A compromised trusted-LAN host, an incorrect firewall rule, or accidental network exposure could allow configuration reads or modification. This is an accepted risk for the current deployment.

### Operators must not

- Expose port 32000 directly to the Internet
- Create WAN port-forwarding to the service
- Publish the configuration API through an Internet-facing reverse proxy
- Allow untrusted Guest or IoT networks to access the service unintentionally

The deployment model assumes no WAN/public Internet exposure, trusted LAN clients only, and firewall/VLAN policy enforcing the intended network boundary.

### When to reconsider

Application-level authentication should be added if the service becomes Internet-accessible, remote access is added, access from untrusted VLANs is required, multiple users with different trust levels use the service, a reverse proxy exposes the API outside the trusted LAN, or the service moves to a zero-trust network model. If authentication is added, prefer a minimal administrative token or equivalent mechanism over broad authentication architecture.

---

## License

[MIT License](./LICENSE) © 2026 dodson labs

---

## See Also

- [CLAUDE.md](./CLAUDE.md) — Detailed architecture and development guide
- [Swagger UI](http://localhost:32000/swagger) — Interactive API documentation (run locally)
