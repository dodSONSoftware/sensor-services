#!/usr/bin/env bash
# ------------------------------------------------
# P3-8 Docker regression checks.
#
# Run from anywhere; the script resolves the code/ directory itself.
# Requires a working Docker daemon and network access for the builder's
# npm install. Exits non-zero on the first failed check.
#
# Documented configuration strategy (see CLAUDE.md):
#   The committed config.yml is intentionally secret-free — it carries no
#   db-password. Credentials arrive from OUTSIDE the repo:
#     - bare metal: a gitignored sibling config-secrets.yml next to the base
#       config (the build copies it to dist/ alongside config.yml);
#     - Docker: a MOUNTED config, because config-secrets.yml must never be
#       baked into the image. The app reads /app/configs/config.yml first
#       (the mount point), then falls back to ./dist/config.yml (the same
#       secret-free default bare metal uses).
#   So a container is NOT expected to start from the built-in default alone:
#   it requires a mounted config that supplies the credentials. That is the
#   behavior this script pins, rather than treating the baked default as a
#   fully-working fallback.
#
# Checks (the P3-8 minimum):
#   1. The Docker image builds successfully.
#   2. The application starts with the documented configuration strategy —
#      a mounted config supplying credentials (db-password). And the mirror
#      image of that strategy: with NO config mounted, the built-in
#      secret-free default cannot satisfy the required db-password, so the
#      container exits at startup (fail-fast, not a silent partial start).
#   3. No real secret file (config-secrets.yml) exists inside the final image.
#   4. Swagger still initializes correctly (UI served, spec contains the real
#      route paths built from the copied src/routes subset).
# ------------------------------------------------
set -euo pipefail

CODE_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$CODE_DIR"

IMAGE="sensor-services-p38-verify"
CONTAINER="sensor-services-p38-verify-$$"
PORT="${VERIFY_PORT:-32099}"

CONFIG_DIR="$(mktemp -d)"
# mktemp -d creates a 700 dir owned by the host user; the container runs as
# non-root appuser (UID 100) and must be able to traverse and read the mount.
chmod 755 "$CONFIG_DIR"
cleanup() {
    docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
    docker rmi "$IMAGE" >/dev/null 2>&1 || true
    rm -rf "$CONFIG_DIR"
}
trap cleanup EXIT

# A complete config for the container: every required key present, with
# localhost values so any DB/MQTT connection fails fast (ECONNREFUSED) instead
# of timing out against an unroutable address. The app still boots — settings
# persist to the in-memory fallback and MQTT simply reports disconnected.
cat > "$CONFIG_DIR/config.yml" <<'YAML'
log-level: info
express-port: 32000
mqtt-broker-ip-address: "127.0.0.1"
mqtt-topic-telemetry: "iot/v3/telemetry"
mqtt-topic-command: "iot/v3/command"
mqtt-topic-command-response: "iot/v3/command-response"
ip-pinger-web-api: "http://127.0.0.1:3300"
case-sensitive: true
db-host: "127.0.0.1"
db-port: 5432
db-name: "sensor_web_services"
db-user: "appuser"
YAML
# Sibling secrets file (the documented Docker mechanism for credentials).
# Placeholder value only — it just needs to satisfy the required-string check.
cat > "$CONFIG_DIR/config-secrets.yml" <<'YAML'
db-password: "verify-test-only-not-a-real-secret"
YAML
chmod 644 "$CONFIG_DIR/config.yml" "$CONFIG_DIR/config-secrets.yml"

echo "[1/4] Building image..."
docker build -t "$IMAGE" .
echo "      image built: $IMAGE"

echo "[2/4] Verifying the documented configuration strategy..."

# 2a. Negative: with NO config mounted, the built-in secret-free default lacks
#     the required db-password, so startup must fail fast (non-zero exit).
#     This is the intended "a mounted config is required" behavior.
if docker run --rm "$IMAGE" >/dev/null 2>&1; then
    echo "      FAILED: container started with no mounted config — but the built-in default has no db-password, so it must exit at startup" >&2
    exit 1
fi
echo "      (correctly) refuses to start without a mounted config"

# 2b. Positive: with a mounted config supplying credentials, the app starts.
#     Probe /date_utc (always 200 when the server is up) rather than /health,
#     because /health returns 503 when MQTT is disconnected — which it will be
#     in a sandbox. "Server is up" is the property under test here.
docker run -d --name "$CONTAINER" -p "$PORT:32000" \
    -v "$CONFIG_DIR:/app/configs:ro" "$IMAGE" >/dev/null

started=""
for _ in $(seq 1 60); do
    if curl -sf "http://localhost:$PORT/date_utc" >/dev/null 2>&1; then
        started=yes
        break
    fi
    if [ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null)" != "true" ]; then
        break
    fi
    sleep 1
done

if [ -z "$started" ]; then
    echo "      FAILED: /date_utc never returned 200; container logs:" >&2
    docker logs "$CONTAINER" >&2 || true
    exit 1
fi
echo "      app is up with a mounted config (date_utc: $(curl -sf "http://localhost:$PORT/date_utc"))"

echo "[3/4] Checking that no config-secrets.yml exists inside the image..."
# Inspect the image itself (no mounts), so a runtime mount cannot mask the result.
if docker run --rm "$IMAGE" sh -c 'find /app -name "config-secrets.yml" 2>/dev/null | grep -q .'; then
    echo "      FAILED: config-secrets.yml found inside the image:" >&2
    docker run --rm "$IMAGE" sh -c 'find /app -name "config-secrets.yml" 2>/dev/null' >&2
    exit 1
fi
echo "      no secret file in the image"

echo "[4/4] Checking that Swagger initializes..."
swagger_status="$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT/swagger/")"
if [ "$swagger_status" != "200" ]; then
    echo "      FAILED: GET /swagger/ returned $swagger_status (expected 200)" >&2
    exit 1
fi
# The spec is built at startup from the copied src/routes subset. If that
# subset were missing, swagger-ui would serve a spec with no paths — assert
# that real route paths made it into the served document. (These are paths
# with @swagger JSDoc; pingerRoutes.ts intentionally has none, so /ippinger/*
# is not expected here.)
swagger_init="$(curl -sf "http://localhost:$PORT/swagger/swagger-ui-init.js")"
for path in "sensors/get-details" "api/read-config" "ui/settings-update"; do
    if ! printf '%s' "$swagger_init" | grep -q "$path"; then
        echo "      FAILED: served swagger spec does not contain route '$path'" >&2
        exit 1
    fi
done
echo "      swagger UI up and spec contains the real route paths"

echo ""
echo "All P3-8 Docker regression checks passed."
