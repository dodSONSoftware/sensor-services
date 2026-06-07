# Fixit — Issues & Enhancements for sensor-web-services

> Generated: 2026-06-06
> Scope: All files under `code/` (source, tests, config, Docker)

---

## 🔴 Critical Bugs (runtime failures, data loss, hangs)

### C1. `Logger.ts:87` — `this.global_log_level` does not exist
**File:** `code/src/dodsonlabs/Logger.ts`, line 87
```typescript
this.global_log_level.valueOf()  // ❌ property doesn't exist
```
The property is named `global_log_level_value`. `this.global_log_level` is `undefined`, so `.valueOf()` throws `TypeError`. **Every log call crashes the app.**

**Fix:** Change `this.global_log_level.valueOf()` to `this.global_log_level_value.valueOf()`.

---

### C2. `pingerController.ts` — `fetchIt()` / `postIt()` never respond on error
**File:** `code/src/controllers/pingerController.ts`, lines 18–53, 55–86
Both functions use `.catch()` that only logs the error — the HTTP response is **never sent**. Clients hang until their timeout. The inline comment on line 33 even acknowledges this: `// !!!! Research this: should I throw an Error`.

**Fix:** Convert to `async/await` and send a 502/500 response in the catch block:
```typescript
export async function getAbout(req, res, api) {
    try {
        const r = await fetch(url);
        const data = await r.json();
        res.status(r.ok ? OK : InternalServerError).type(Json).send(data);
    } catch (err) {
        logger?.write_error(...);
        res.status(502).type(Json).send({ error: "upstream unavailable" });
    }
}
```

---

### C3. `pingerController.ts:266` — `ippingerConfig["devices"]` can be `undefined`
**File:** `code/src/controllers/pingerController.ts`, line 266
When `fetchItOnly` returns `{}` on error (lines 155, 164), `ippingerConfig["devices"]` is `undefined`. The cast `as Record<string, any>[]` doesn't help — `analyzeIt` then calls `.forEach()` on `undefined` and crashes.

**Fix:** Return `null` instead of `{}` on error, or guard with `const devices = (ippingerConfig as Record<string, any>)?.devices ?? []`.

---

### C4. `pingerController.ts:212,230` — Unprotected nested property access
**File:** `code/src/controllers/pingerController.ts`, lines 212, 230
```typescript
x["payload"]["ip-address"]   // throws if payload is undefined
sensor["payload"]["ip-address"]  // same
```
If a sensor telemetry message has no `payload` key, these throw `TypeError`.

**Fix:** Use optional chaining: `x?.["payload"]?.["ip-address"]`.

---

### C5. `sensorController.ts:117,158` — `res.send(error)` sends empty `{}`
**File:** `code/src/controllers/sensorController.ts`, lines 117, 158
`Error` objects have no enumerable properties, so `res.send(error)` serializes to `{}`. The caller gets a 500 with no error message.

**Fix:** `res.status(InternalServerError).json({ error: error.message })`.

---

### C6. `MqttNetworking.ts:175,317` — Silent message drops on missing keys
**File:** `code/src/dodsonlabs/MqttNetworking.ts`, lines 175, 317
```typescript
json_doc["message-type"].toString()   // → "undefined" if key missing
String(json_doc["type"])              // → "undefined" if key missing
```
When a key is absent, the string `"undefined"` is compared against switch cases and the message is silently dropped with no log.

**Fix:** Add explicit undefined checks and log a warning before dropping.

---

## 🟠 High Priority (correctness, security, reliability)

### H1. `MqttNetworking.ts` — Telemetry nested access without null checks
**File:** `code/src/dodsonlabs/MqttNetworking.ts`, lines 232–254
```typescript
json_doc["payload"]["air"]["temperature-c"]  // 4 levels deep, no guards
```
If any intermediate property is missing, the whole app crashes. The `if (air_telemetry != undefined)` check only guards the top level.

**Enhancement:** Use optional chaining or a safe accessor helper.

---

### H2. `MqttNetworking.ts:260-288` — Loose equality (`!=`)
**File:** `code/src/dodsonlabs/MqttNetworking.ts`, lines 260–288
Uses `!=` and `!= undefined` instead of `!==` and `!== undefined`. Inconsistent with the rest of the codebase which uses strict equality.

**Fix:** Replace all `!=` with `!==`.

---

### H3. `sensorController.ts:54-66` — Infinite polling loop risk
**File:** `code/src/controllers/sensorController.ts`, lines 54–66
The `while(true)` polling loop calls `restart_clock()` which resets the timeout. If incoming messages keep arriving, the timeout is pushed indefinitely and the loop hangs forever.

**Fix:** Add a maximum iteration count or absolute time limit as a hard cap.

---

### H4. `PrometheusWriter.ts:157` — Wrong originator string in log
**File:** `code/src/dodsonlabs/PrometheusWriter.ts`, line 157
`publish_water` logs with `"publish_air"` as the originator string (missing `.publish_water`).

**Fix:** Change to `this.originator + ".publish_water"`.

---

### H5. `PrometheusWriter.ts:57` — No error handling on `listen()`
**File:** `code/src/dodsonlabs/PrometheusWriter.ts`, line 57
If the Prometheus port is already in use, `listen()` emits an error event but the process continues without the metrics server. No error is caught or logged.

**Fix:** Add an `error` event listener on the server:
```typescript
this.server.on("error", (err) => logger.write_error(...));
```

---

### H6. `docker-create.sh` — Privileged container + Docker socket mount
**File:** `code/docker-create.sh`
Running `--privileged` with `/var/run/docker.sock` mounted gives the container full root access to the host. This is a significant security risk.

**Enhancement:** Use `--cap-add` with only the needed capabilities instead of `--privileged`. Or run the container as a non-root user with limited capabilities.

---

### H7. `Dockerfile` — No `.dockerignore`, copies everything
**File:** `code/Dockerfile`
`COPY . .` copies `node_modules/`, `tests/`, `*.test.ts`, ESLint config, etc. into the builder stage. Increases image size and leaks dev artifacts into production.

**Fix:** Create a `.dockerignore` that excludes `node_modules/`, `tests/`, `*.test.ts`, `*.md`, `.git/`, `.vscode/`.

---

### H8. `Dockerfile` — Runs as root
**File:** `code/Dockerfile`
No `USER` directive — the container runs as root.

**Fix:** Add `RUN useradd -r -s /bin/false appuser` and `USER appuser`.

---

### H9. `Dockerfile` — Installs Docker CLI unnecessarily
**File:** `code/Dockerfile`, lines 39–50
The Docker CLI is installed inside the container but never used by the application. Adds ~50MB and attack surface.

**Fix:** Remove the Docker CLI installation unless there's a runtime need.

---

### H10. `SystemFunctions.ts:206-220` — Command injection vulnerability
**File:** `code/src/dodsonlabs/SystemFunctions.ts`
`executeBashCommand` runs arbitrary shell commands. While currently unused (dead code), it's a security landmine if ever connected to user input.

**Fix:** Remove the function entirely, or at minimum add a `@deprecated` JSDoc comment.

---

### H11. `sensorController.ts` — POST endpoints accept arbitrary JSON
**File:** `code/src/controllers/sensorController.ts`, lines 180–220
`write-config` and `update-config` accept any JSON body and forward it to sensors via MQTT with no validation. A malicious client could send arbitrary commands.

**Enhancement:** Add Zod or manual schema validation for config write payloads.

---

## 🟡 Medium Priority (type safety, code quality, maintainability)

### M1. Widespread `any` usage
**Files:** `Interfaces.ts`, `Logger.ts:15`, `MqttNetworking.ts:21,49`, `PrometheusWriter.ts:16,19,20,51,84,104,119,132,151,165`, `SystemFunctions.ts:14,60`, `pingerController.ts:174`

The codebase claims strict TypeScript mode but uses `any` extensively. Key examples:
- `Interfaces.ts:21` — `commands: any[]`
- `Interfaces.ts:44` — `publish_mqtt_message(..., message: Record<string, any>)`
- `PrometheusWriter.ts` — every `publish_*` method takes `payload: any`
- `MqttNetworking.ts` — `config: Record<string, any>`

**Enhancement:** Define typed interfaces for sensor telemetry, config objects, and MQTT messages. Replace `any` with `unknown` + type guards where the shape is truly dynamic.

---

### M2. `swagger.ts:30` — Relative glob path breaks after `npm start`
**File:** `code/src/swagger.ts`, line 30
```typescript
apis: ["./src/routes/**/*.ts"]
```
After `npm start`, the CWD is `dist/` (per Dockerfile `WORKDIR /app/dist`). The glob `./src/routes/**/*.ts` doesn't exist from `dist/`, so Swagger has no route definitions.

**Fix:** Resolve the glob relative to the source directory:
```typescript
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// But this is CJS... use process.cwd() + "/../src" or pass from index.ts
```

---

### M3. `middleware.ts:19` — Dynamic `require("cors")`
**File:** `code/src/middleware/middleware.ts`, line 19
```typescript
const cors = require("cors");
```
Should be a static `import` at the top of the file.

**Fix:** `import cors from "cors";` at the top, remove the `require`.

---

### M4. `routeNotFound.ts:35` — Magic number `404`
**File:** `code/src/routes/routeNotFound.ts`, line 35
Uses literal `404` instead of `HttpConstants.NotFound` (which doesn't exist, but the pattern should be established).

**Enhancement:** Add `NotFound = 404` to `HttpConstants.ts` and use it here.

---

### M5. `sensorController.ts:197` — Inconsistent naming: `PostRebootBySource`
**File:** `code/src/controllers/sensorController.ts`, line 197
`postReboot` is camelCase but `PostRebootBySource` is PascalCase.

**Fix:** Rename to `postRebootBySource`.

---

### M6. `sensorController.ts:68,102` — Unused parameters
**File:** `code/src/controllers/sensorController.ts`
- Line 68: `parameters: string = ""` is declared but never used
- Line 102: `_parameters: string = ""` uses underscore prefix to silence the linter

**Fix:** Remove unused parameters, or use them if they were intended.

---

### M7. `pingerController.ts:168` — `createAnalyzeResult` mutates its argument
**File:** `code/src/controllers/pingerController.ts`, line 168
```typescript
origin["state"] = state;  // mutates the caller's object
```
The caller's original sensor/device object is modified in-place.

**Fix:** Create a new object: `return { ...origin, state, "state-value": state_value };`.

---

### M8. `generalController.ts:30` — `padStart(2, "0")` on 4-digit year
**File:** `code/src/controllers/generalController.ts`, line 30
```typescript
const y = dt.getFullYear().toString().padStart(2, "0");
```
`getFullYear()` returns a 4-digit string like `"2026"`. `padStart(2, "0")` is a no-op on a 4-character string.

**Fix:** Either remove `padStart` entirely or use `padStart(4, "0")` if zero-padding is desired.

---

### M9. `common/global.ts:17` — Mutable exported logger
**File:** `code/src/common/global.ts`, line 17
```typescript
export let logger: Logger | undefined;
```
Any module can reassign `logger` to `undefined`, breaking all consumers.

**Fix:** Use a getter pattern:
```typescript
let _logger: Logger | undefined;
export function setLogger(l: Logger) { _logger = l; }
export const logger = () => _logger;
```

---

### M10. `common/global.ts:37` — `sys_info` never populated
**File:** `code/src/common/global.ts`, line 37
```typescript
const sys_info: unknown[] = [];  // TODO: add system information
```
The `IAbout` interface declares `system_info: any[]`. Types are inconsistent (`unknown[]` vs `any[]`) and the array is never populated.

**Enhancement:** Populate with OS info (platform, uptime, memory) or remove the field.

---

### M11. Swagger documentation — mostly empty or inaccurate
**Files:** `routes/sensorRoutes.ts`, `routes/pingerRoutes.ts`
- `sensorRoutes.ts`: empty `description` fields, single-period descriptions (`"."`)
- `pingerRoutes.ts`: `summary: ""` and `description: "."` on almost every route
- `pingerRoutes.ts`: Swagger says `post` but route is `.get()` for `/ippinger/ping`
- `pingerRoutes.ts`: Path says `/sensors/analyze-ippinger` but actual route is `/ippinger/analyze-ippinger`
- `generalRoutes.ts`: Swagger says response is `{ localTime }` but returns a plain string

**Enhancement:** Fill in all swagger `summary` and `description` fields. Fix method/path mismatches.

---

### M12. `tsconfig.json` — Excludes wrong filenames
**File:** `code/tsconfig.json`
Excludes `jest.config.js` and `jest.setup.js` but the actual files are `.ts`. Harmless typo but indicates the exclude list is stale.

**Fix:** Change to `jest.config.ts` and `jest.setup.ts`.

---

### M13. `@types/node` version lags behind Volta target
**File:** `code/package.json`
Volta targets Node 22.22.0 but `@types/node` is `^20.14.9`. Node 22 has type differences (e.g., `fetch` types, `import.meta` types).

**Fix:** Update to `@types/node@^22.x`.

---

### M14. `build` script runs `npm install`
**File:** `code/package.json`, line 9
```json
"build": "npm install && tsc && cp ./src/config.json ./dist/"
```
Every build re-installs all dependencies. Slow and non-deterministic if `package-lock.json` isn't committed.

**Fix:** `"build": "tsc && cp ./src/config.json ./dist/"`. Run `npm install` separately (CI should handle this).

---

### M15. `MqttNetworking.ts` — `handle_mqtt_message_log` is a TODO stub
**File:** `code/src/dodsonlabs/MqttNetworking.ts`, lines 207–219
All sensor log messages are silently dropped. The function body is empty with TODO comments.

**Enhancement:** Forward log messages to the application logger, or implement Loki/external log integration as noted in the TODO.

---

### M16. `MqttNetworking.ts` — `json_doc` mutated in-place
**File:** `code/src/dodsonlabs/MqttNetworking.ts`, lines 248, 252
Telemetry handler mutates the parsed JSON document in-place. If the same object reference is used elsewhere, this has side effects.

**Enhancement:** Work on a copy or restructure to avoid mutation.

---

### M17. `index.ts:91` — Dead code: `logger === undefined` check
**File:** `code/src/index.ts`, line 91
`createLogger` always assigns `logger = new Logger(config)`. The subsequent `if (logger === undefined)` check is dead code.

**Fix:** Remove the dead check.

---

### M18. `index.ts:111` — `EXPRESS_PORT` `"0"` silently ignored
**File:** `code/src/index.ts`, line 111
```typescript
const port = Number(process.env.EXPRESS_PORT) || 32000;
```
`Number("0")` is `0`, which is falsy, so it falls through to `32000`. Port `0` is valid (OS-assigned ephemeral port).

**Fix:** `const port = process.env.EXPRESS_PORT ? Number(process.env.EXPRESS_PORT) : 32000;`

---

### M19. `Interfaces.ts:8` — Unusual import path `mqtt/*`
**File:** `code/src/dodsonlabs/Interfaces.ts`, line 8
```typescript
import mqtt from "mqtt/*";
```
The `/*` trailing wildcard is non-standard. It's a TypeScript/ESM workaround for the mqtt package's ESM exports but may break with different toolchains.

**Enhancement:** Consider using `tsx` instead of `ts-node` for better ESM support, then use a standard import.

---

### M20. ESLint excludes `tests/` and `dodsonlabs/`
**File:** `code/eslint.config.mjs`
Test files and the entire dodsonlabs library have no lint coverage. The dodsonlabs directory contains the most complex code (MqttNetworking, PrometheusWriter, Logger) with the most `any` usage.

**Enhancement:** Add lint rules for the dodsonlabs directory (at minimum `@typescript-eslint/no-explicit-any: "error"`). Consider linting test files too.

---

## 🟢 Low Priority (cosmetic, documentation, tech debt)

### L1. Typo: "playload" → "payload"
**File:** `code/src/controllers/sensorController.ts`, line 37

### L2. Typo: "intialize" → "initialize"
**File:** `code/src/controllers/sensorController.ts`, line 47

### L3. `Logger.ts:28` — Dead code: `source` field never used
**File:** `code/src/dodsonlabs/Logger.ts`, line 28
```typescript
private readonly source: string = "";
```

### L4. `Logger.ts:103` — All levels go to `console.log`
**File:** `code/src/dodsonlabs/Logger.ts`, line 103
Errors, info, and debug all go to stdout. Errors should go to `console.error`.

### L5. `SystemFunctions.ts` — Dead code: `sleepForever`, `executeBashCommand`, `sleep_from_start`, `randomInt`, `getEnvironmentVariable`
**File:** `code/src/dodsonlabs/SystemFunctions.ts`
Multiple functions have zero callers.

### L6. `routeNotFound.ts:31` — Comment says "protected" but method is private
**File:** `code/src/routes/routeNotFound.ts`, line 31

### L7. `jest.setup.ts` — Console spies never restored
**File:** `code/jest.setup.ts`
`beforeEach` creates spies but no `afterEach` restores them. Can cause memory leaks.

### L8. `jest.config.ts` — Excludes `swagger.ts` unnecessarily
**File:** `code/jest.config.ts`
`swagger.ts` is a 44-line file with trivial logic. Excluding it from coverage is unnecessary.

### L9. `jest.config.ts` — 70% coverage threshold is misleading
The `!src/dodsonlabs/**/*.ts` exclusion removes the largest code portion from coverage. The 70% threshold applies only to the remaining ~30% of files.

### L10. `swagger.ts:39` — `ipAddress.address()` can return non-routable address
**File:** `code/src/swagger.ts`, line 39
May return `127.0.0.1` or a Docker bridge address. No validation or user feedback.

### L11. `sensorController.ts:195` — `postReboot` uses `get_it` function
The reboot command uses `get_it` (GET-style MQTT command) rather than `post_it`. This is likely intentional but the naming is confusing.

### L12. `__routesHelp` objects can drift out of sync
**File:** `code/src/routes/*.ts`
The `__routesHelp` arrays list commands for the `/about` endpoint but there's no validation that the routes actually exist for each entry.

### L13. No `moduleResolution` in `tsconfig.json`
**File:** `code/tsconfig.json`
Relies on implicit `"node"` resolution. Explicit is better.

### L14. No `noUnusedLocals` / `noUnusedParameters` in `tsconfig.json`
**File:** `code/tsconfig.json`
These are only enforced by ESLint. TypeScript and ESLint could disagree on what is unused.

---

## 🚀 Enhancements (new features, improvements)

### E1. Add authentication / authorization
Currently all endpoints are publicly accessible. Even if this is behind a firewall, adding at least an API key middleware would prevent accidental exposure.

### E2. Add request validation with Zod
All API inputs (query params, body, path params) should be validated with Zod schemas before processing. This would catch malformed requests early and improve error messages.

### E3. Structured logging
Replace `console.log` with a structured logger (e.g., `pino` or `winston`) that outputs JSON. This enables proper log aggregation (the TODO in `handle_mqtt_message_log` references Loki).

### E4. Proper error handling middleware
Add an Express error-handling middleware that catches all errors, logs them, and returns a consistent error format:
```json
{ "error": { "code": "UPSTREAM_UNAVAILABLE", "message": "..." } }
```

### E5. Health endpoint with dependency checks
The `/health` endpoint currently only reports MQTT connectivity. Add checks for:
- Prometheus metrics server status
- Database connectivity (if added later)
- Memory/CPU usage

### E6. Graceful shutdown improvements
The current shutdown handler closes the HTTP server and calls `networking.close()`. Add:
- Drain in-flight requests
- Flush Prometheus metrics
- Close MQTT client with a timeout

### E7. Configuration hot-reload
Currently config is read once at startup. Adding a config reload mechanism (e.g., `SIGHUP` signal or HTTP endpoint) would allow runtime changes without restart.

### E8. MQTT message schema validation
Incoming MQTT messages are parsed with no schema validation. Adding Zod schemas for telemetry, command-response, and log message formats would catch malformed sensor data early.

### E9. Prometheus metrics for the API itself
Add built-in Express metrics (request count, latency, error rate) alongside the sensor gauges. The `prom-client` library is already a dependency.

### E10. Rate limiting
Add rate limiting middleware to prevent abuse of the sensor command endpoints (reboot, write-config, etc.).

### E11. Command deduplication
The MQTT command-response system doesn't deduplicate commands. If the same command is sent twice, two response trackers are created. Add a command ID deduplication layer.

### E12. Add integration tests for sensor and pinger routes
Currently only general routes have integration tests (via supertest). Add tests for sensor and pinger routes with mocked MQTT networking.

### E13. Environment-specific config files
Support `config.local.json`, `config.prod.json`, etc. with environment variable overrides for different deployment targets.

### E14. OpenAPI spec generation
Instead of JSDoc-based Swagger (which is error-prone and out of sync), generate the OpenAPI spec from code using a library like `@asteasolutions/zod-openapi` or `express-to-openapi`.

### E15. Add health check for the Prometheus metrics server
The PrometheusWriter server has no health endpoint. Add `/health` on port 3301.

---

## Summary by Category

| Category | Count |
|----------|-------|
| 🔴 Critical Bugs | 6 |
| 🟠 High Priority | 11 |
| 🟡 Medium Priority | 20 |
| 🟢 Low Priority | 14 |
| 🚀 Enhancements | 15 |
| **Total** | **66** |

## Recommended Priority Order

1. **C1** — Logger crash (app is likely broken on every log call)
2. **C2** — Pinger fetch hangs (clients timeout on any upstream failure)
3. **C3** — Analyze endpoint crash on error
4. **C5** — Error responses return `{}`
5. **C6** — Silent MQTT message drops
6. **H1** — Telemetry crash on malformed data
7. **H5** — Prometheus server silent failure
8. **H6/H7/H8** — Docker security hardening
9. **M1** — Replace `any` with typed interfaces
10. **M3** — Fix `require("cors")` import
11. **M11** — Fix swagger documentation
12. **E1–E4** — Auth, validation, structured logging, error middleware
