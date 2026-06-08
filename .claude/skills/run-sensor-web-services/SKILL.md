---
name: run-sensor-web-services
description: run, start, build, test, and smoke-test the Sensor Web Services Express API — launch the server, hit endpoints with curl, run the smoke driver, run tests
---

Sensor Web Services is an Express 4 REST API that bridges IoT weather sensors (via MQTT) to HTTP clients and Prometheus. It runs two HTTP servers: main app on port 32000 and Prometheus metrics on port 3301.

## Prerequisites

```bash
# Node.js 22 ( Volta pins 22.22.0 — use nvm or your preferred manager)
# No OS-level packages needed beyond Node
```

## Build

```bash
cd /home/worker/Documents/code/sensor-services/sensor-web-services/code
npm run build
```

Compiles TypeScript to `dist/` and copies `config.yml` into `dist/`.

## Run (agent path)

### 1. Start the server

```bash
cd /home/worker/Documents/code/sensor-services/sensor-web-services/code
node ./dist/index.js
```

The server starts on port 32000 (main) and 3301 (Prometheus). If port 3301 is already in use from a previous instance, kill it first:

```bash
fuser -k 3301/tcp 2>/dev/null
```

### 2. Run the smoke driver

In a **separate terminal**, run:

```bash
cd /home/worker/Documents/code/sensor-services/sensor-web-services
node .claude/skills/run-sensor-web-services/driver.mjs
```

This waits for the server to be ready, then hits every public endpoint (`/about`, `/health`, `/date_local`, `/date_utc`, `/sensors/*`, `/ippinger/*`, `/metrics`, `/metrics/api`, `/swagger`) and reports pass/fail.

### 3. Quick curl checks (alternative to driver)

```bash
curl -s http://localhost:32000/health | jq .
curl -s http://localhost:32000/about | jq .about.name
curl -s http://localhost:3301/metrics | head -10
curl -s http://localhost:32000/metrics/api | head -5
```

## Run (human path)

```bash
cd /home/worker/Documents/code/sensor-services/sensor-web-services/code
npm start          # node ./dist/index.js  (Ctrl-C to stop)
npm run dev        # nodemon + ts-node hot-reload
```

Swagger UI is at `http://localhost:32000/swagger`.

## Test

```bash
cd /home/worker/Documents/code/sensor-services/sensor-web-services/code
npm test           # Jest — 9 suites, 86 tests
npm run test:coverage
npm run lint       # ESLint 9.x
```

## Gotchas

- **Config path bug**: The app tries `/app/dist/config.yml` first, but `read_file_yaml` returns `{ data: null, error: "..." }` (not `null`) when the file is missing, so the `??` fallback never fires. This repo has a patch in `src/index.ts` that checks `data === null` explicitly — if you rebuild from a clean clone, apply the same fix.
- **MQTT broker unreachable**: The default broker is `192.168.1.4`. In containers or CI this will fail to connect, but the server still starts and serves HTTP. Health will show `mqtt: "connected"` based on last-known state.
- **Port 3301 EADDRINUSE**: If you restart the app without killing the old process, the Prometheus server crashes with `EADDRINUSE` while the main server starts fine. Kill the old process first.
- **`/ippinger/*` proxies to `192.168.1.4:3300`**: These will fail if the IP Pinger service isn't running on the expected host.
