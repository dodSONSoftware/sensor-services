# Issues & Enhancements

## Critical / Bugs

- **Blocking `sleep()` in MQTT reconnect** — `MqttNetworking.on_disconnect()` and `on_error()` call `sysFunc.sleep(3000)`, which blocks the entire Node.js event loop and freezes the app during reconnection
- **Sensor command polling uses blocking `while(true)` loop** — `sensorController.ts` spins with `sleep(1000)` checking `is_timed_out` instead of using async event completion, holding up the HTTP response thread
- **`routeNotFound.ts` exists but is never wired** — the 404 handler module is imported (commented out) but never instantiated in `index.ts`, so unmatched routes get Express's default 404 with no logging
- **`createAnalyzeResult` state-value type mismatch** — the `state_value` parameter was changed from `string` to `Record<string, any>` but the function signature still accepts the old type in some call sites; the TODO comments in `analyzeIt()` indicate the logic is incomplete

## High Priority

- **`case_sensitive` is hardcoded to `true`** in `index.ts:70` with a TODO to make it configurable — should be moved to `config.json`
- **`handle_mqtt_message_log()` is a TODO stub** — MQTT log messages from sensors are received but discarded; the TODO references Loki integration
- **`SensorCreatorBase.ts` is an unused duplicate** of `CreatorBase.ts` — should be removed

## Medium Priority

- **No test framework** — no Jest, Vitest, or any test infrastructure; zero test coverage
- **No linting or formatting** — no ESLint, Prettier, or similar tooling configured
- **No authentication or authorization** — middleware only provides CORS, JSON parsing, and request logging; the `// TODO: add more middleware` comment in `middleware.ts:35`
- **No database** — `DBFunctions.ts` is entirely commented out (was planned MariaDB integration for health, logs, telemetry)
- **No CI/CD pipeline** — no GitHub Actions, GitLab CI, or other automation
- **Swagger server URL is hardcoded** to `192.168.1.214` in `swagger.ts` — should be configurable or derived from the request
- **`ip-pinger-web-api` address differs** between `config.json` (`192.168.1.4`) and the fallback in `index.ts` (also `192.168.1.4` now, but was `192.168.1.215` before — easy to drift)
- **`dodsonlabs/` is a git submodule** from an internal GitLab instance — new developers need to manually clone it from `192.168.7.135:3000` or `192.168.1.5:30008`

## Low Priority / Nice-to-Have

- **`sys_info` array in `aboutDude()` is always empty** — has a TODO to populate with system information (OS, uptime, etc.)
- **All logging goes to `console.log`** — no file logging, no structured JSON output, no log rotation
- **`routeNotFoundRoutesHelp` is commented out** in `global.ts` — if the 404 handler is ever wired up, the help text needs to be uncommented
- **`docker-create.sh` runs a privileged container** with Docker socket mounted — a security concern for production use
- **No health check endpoint** — unlike many microservices, there's no `/health` or `/ready` endpoint for load balancers or orchestrators
- **PrometheusWriter gauges use `!` non-null assertions** — `this.prometheus_Gauge_AirTemp!.set(...)` — the gauges are declared as `undefined` initially and set in the constructor, but TypeScript can't verify they're always initialized before use
- **No graceful shutdown handling** — the MQTT client and Express servers aren't cleanly closed on `SIGTERM`/`SIGINT`
- **`formatElapsedTime` exists in `SystemFunctions.ts` but doesn't appear to be used** anywhere in the codebase
- **The `__routesHelp` objects in each route file** are the single source of truth for the `/about` command list, but there's no validation that the routes actually exist for each entry — easy to get out of sync
