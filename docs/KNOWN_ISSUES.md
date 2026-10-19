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
| Deployment | Swagger auto-derived server URL skips loopback only | Under Docker, `servers[0].url` is the container-internal IP, so the UI's "Try it out" fails from the host unless `swagger-server-url` is set. Cosmetic: the spec content is unaffected. |
| Verification | Docker end-to-end script requires functioning Docker daemon | Unit tests and static Docker tests do not replace runtime container verification. |
| By design | `POST /restart-service` is best-effort after the 202 | The 202 means *scheduled*, not completed — the process may exit before the client finishes reading. Verify the new process with `GET /health`. |
| By design | A restart does not reconcile deployment surfaces | It re-reads the persisted `config.yml` but does not rebuild the image, update deployment files, or reconcile a changed `express-port` (the compose port map, `EXPOSE` and `HEALTHCHECK` are pinned to 32000) — all those surfaces must change together. |
| By design | A restart depends on the container restart policy | A deployment without a restart policy will not come back after the endpoint stops the process, and a container the operator `docker stop`ped stays stopped (`unless-stopped` restarts on clean exits and daemon restarts, not on explicit stops). Verify `docker inspect sensor-services --format '{{.HostConfig.RestartPolicy.Name}}'` before enabling the endpoint. |
| By design | mqtt.js 5.x imposes no client-side limit on inbound PUBLISH payload size | The broker is unauthenticated, so a forged oversized payload (e.g. a 10 MiB `iot/v3/log`) is bounded by an explicit 64 KiB length guard in `MqttNetworking.on_message()` (dropped with a warning before `JSON.parse` and before any dispatch). No redelivery risk: subscriptions are QoS 0. Largest legitimate documents are ~4 KB, so the headroom is ~16x. |
| By design | 429 responses are counted under `http_requests_total{route="unmatched"}` | The rate limiter answers before Express routing sets `req.route`, so per-route 429 attribution is lost and 429s share the `unmatched` route label with 404s (distinguished by the `status` label). Dashboards should slice by `status="429"`. Moving the limiter after routing would break the middleware-ordering invariant and the "a 429'd request's body is never parsed" property, so this is accepted as-is. |
| Security | A leaked `RESTART_SERVICE_TOKEN` permits repeated-restart denial-of-service | Anyone holding it can restart the service at will (the single-flight guard makes duplicates 409, not a second restart). Treat it as a high-privilege secret: strong value, LAN-only exposure, never in docs, shared command history, or logs. Permissive CORS is not a substitute for the token. |

**Unconfirmed defects:** No additional concrete open bug was established by this documentation inspection. Add reproducible symptoms, impact, affected version, owner/status, workaround and regression test when new defects are confirmed.
