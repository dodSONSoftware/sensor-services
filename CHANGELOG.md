# Changelog

All notable changes to the sensor-services project are documented here. Versions are listed newest first.

## [4.13.15] — Graphite Falcon (2026-10-16)

- Aligned the reference database schema (`database/schema.sql`) with the app's own settings defaults: its seeded telemetry display-mapping keys were stale kebab-case (`temperature-c`) while the app's defaults and the live sensor telemetry use snake_case (`temperature_c`), so an operator who ran the reference schema before first app start would have gotten display keys that never matched live sensor data. The seed row now matches `DEFAULT_SETTINGS` exactly, and a new regression test parses the SQL seed and fails CI on any future drift.
- Note for existing installs that were initialized from the old `schema.sql`: the persisted row still carries kebab-case telemetry keys and must be re-set through the settings UI/API (the app will not migrate them in place).

## [4.13.14] — Graphite Falcon (2026-10-16)

- Removed the dead `getSettingsDefaults` handler from the settings controller: it was unit-tested but bound to no route (absent from `__routes`, `__routesHelp`, and `/endpoints`), so its test suite gave a false signal that a `GET /settings/defaults` endpoint existed. No HTTP behavior changes — the handler was unreachable in production.

## [4.13.13] — Graphite Falcon (2026-10-16)

- Removed the stale `/ippinger/*` proxy-route documentation from the README and architecture docs — the only pinger endpoint this service exposes is `GET /sensors/ippinger-analyze`, and the docs no longer point operators at routes that return 404.
- Added a detailed documentation set under `docs/` (architecture, configuration, engineering decisions, system invariants, known issues, testing) and condensed CLAUDE.md into a compact agent-instructions page that points to it.
