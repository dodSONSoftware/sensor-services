# Changelog

All notable changes to the sensor-services project are documented here. Versions are listed newest first.

## [4.13.13] — Graphite Falcon (2026-10-16)

- Removed the stale `/ippinger/*` proxy-route documentation from the README and architecture docs — the only pinger endpoint this service exposes is `GET /sensors/ippinger-analyze`, and the docs no longer point operators at routes that return 404.
- Added a detailed documentation set under `docs/` (architecture, configuration, engineering decisions, system invariants, known issues, testing) and condensed CLAUDE.md into a compact agent-instructions page that points to it.
