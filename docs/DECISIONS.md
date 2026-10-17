# Sensor Services — Engineering Decisions

This document records important engineering tradeoffs apparent in the current codebase. These are documented implementation decisions, not claims of external approval or historical ADR discussions.

| Decision | Rationale / benefit | Consequence / reconsider when |
| --- | --- | --- |
| One Express process with explicit route registration | Central composition, predictable middleware order and startup assertions | Route classes must be explicitly registered; add metadata and drift coverage for new endpoints |
| Separate sensor command API from telemetry ingestion | Keeps control requests independent from metric ingestion | Telemetry retrieval belongs in sensor-telemetry; do not add parallel ingestion here |
| MQTT V3 envelopes with command IDs and bounded wait | Correlates asynchronous replies with originating HTTP requests | Maintain firmware compatibility; keep disconnect/timeout/serialization paths tested |
| Strict Zod configuration schema | Fail fast on typos and runtime-incompatible values | New configuration keys require schema, docs and tests |
| Single YAML config including credentials | One operational source of truth for runtime and config API | Trusted LAN and filesystem security are mandatory; not appropriate for untrusted exposure without auth |
| Atomic full-document config writes | Prevent torn writes and preserve existing mode | Updates must supply full document; concurrent external edits need operational coordination |
| Hot-reload log level only | Avoid partial reconfiguration of long-lived clients and unintended Loki destination changes | Most edits require restart |
| PostgreSQL-backed settings with in-memory fallback | UI remains functional during DB downtime | Fallback updates are non-durable; DB write errors after successful init must not be falsely accepted |
| Route declaration/live-router drift checks | Fail startup if endpoint metadata diverges | All new routes require declarations and help metadata |
| Separate Prometheus API registry and bounded route labels | Scraping remains low-cardinality and independent of sensor ingestion | Exclude `/health` and `/metrics` from rate limiting |
| Explicit, ordered and bounded shutdown, with the HTTP close step capped by a short grace + `closeAllConnections()` | Avoids stuck resources and forced Docker termination; a slow in-flight request or the Node 22 keep-alive idle drain can no longer consume the whole 15s budget | Docker stop grace must exceed the 15-second application deadline; in-flight HTTP requests are torn down after the grace (~4s) rather than completing up to their own cap — acceptable at shutdown |
| Swagger scans route source at runtime | Automatically derives API documentation from existing route definitions | Runtime image must retain the source route directory |
| Central two-tier log redaction at the `Logger` `write_*` seam (shared library) | One auditable pass covers every current/future caller, including untrusted forwarded sensor log lines; caller-side redaction kept as defense in depth (the write-config metadata projection is stronger than masking) | Hot path: one linear key-pattern pass plus up to two literal substring passes per line; the key tier recognizes key/value forms only (free-form prose with unknown values relies on the value tier and caller-side redaction); the `dodsonlabs/` change must be mirrored to sibling services; re-verify the value tier if config secrets ever hot-reload (values are captured at construction; only `log-level` hot-reloads today) |

When changing an architectural decision, update this file with the new behavior, motivation, risks and migration/testing implications; avoid preserving historical claims unsupported by repository evidence.
