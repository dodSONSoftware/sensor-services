# Sensor Services — Known Issues

This document tracks limitations and risks verified from the supplied codebase. A limitation below is **not** a claim of an observed production incident.

| Status | Issue / limitation | Impact and mitigation |
| --- | --- | --- |
| By design | No HTTP authentication or authorization | Config writes/reads, command endpoints and logs rely on network isolation. Do not expose the port to untrusted networks; add auth before broader deployment. |
| By design | `src/config.yml` is compiled into the artifact and currently includes credentials | Secrets may be present in repository copies and built images. Restrict access, provide protected mounted config, rotate any exposed credentials and consider separating secrets before public distribution. |
| By design | In-memory settings fallback when PostgreSQL is unavailable at startup | Settings patches succeed but disappear on restart (`X-Settings-Persisted: false`). Restore DB connectivity for durable storage. |
| By design | Configuration reload updates `log-level` only | Changes to MQTT, database, HTTP and Loki properties require restart. Use `restart_keys` from reload output. |
| Compatibility | `fetch-timeout-ms` retained as deprecated configuration alias | Prefer `ippinger-fetch-timeout-ms`; new key takes precedence when both exist. |
| Compatibility | `GET` reboot alias remains; `update-config` returns HTTP 501 | Move callers to `POST /sensors/reboot[/:source]` and supported write-config API. |
| Deployment | Compiled fallback YAML is valid if no mounted configuration exists | Accidentally starting without a mount may connect to unintended configured services. Verify `/app/configs/config.yml` mounting and credentials before deployment. |
| Deployment | Docker Compose hard-codes published port 32000 | If `express-port` changes, update healthcheck and Compose mapping together. |
| Deployment | Swagger relies on source route files packaged in runtime image | Removing copied `src/routes/` breaks startup API generation; preserve Dockerfile behavior. |
| Verification | Docker end-to-end script requires functioning Docker daemon | Unit tests and static Docker tests do not replace runtime container verification. |

**Unconfirmed defects:** No additional concrete open bug was established by this documentation inspection. Add reproducible symptoms, impact, affected version, owner/status, workaround and regression test when new defects are confirmed.
