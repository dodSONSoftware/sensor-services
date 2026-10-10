#!/usr/bin/env bash
# ------------------------------------------------
# P3-8 Docker regression checks.
#
# Run from anywhere; the script resolves the code/ directory itself.
# Requires a working Docker daemon and network access for the builder's
# npm install. Exits non-zero on the first failed check.
#
# Documented configuration strategy (see CLAUDE.md):
#   config.yml is the single source of truth for all application
#   configuration, including credentials (db-password, loki-url). The
#   committed config.yml is a complete, independently valid configuration,
#   and the canonical build copies it into the image as /app/dist/config.yml.
#   The app reads /app/configs/config.yml first (the docker-compose mount
#   point) and then falls back to ./dist/config.yml, so a mounted config
#   always takes precedence over the built-in one.
#
# Checks (the P3-8 minimum):
#   1. The Docker image builds successfully.
#   2. The built-in complete configuration starts the application with NO
#      config mounted.
#   3. A mounted /app/configs/config.yml takes precedence over the built-in
#      configuration.
#   4. Swagger still initializes correctly (UI served, spec contains the real
#      route paths built from the copied src/routes subset).
# ------------------------------------------------
set -euo pipefail

CODE_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$CODE_DIR"

IMAGE="sensor-services-p38-verify"
CONTAINER="sensor-services-p38-verify-$$"
PORT="${VERIFY_PORT:-32099}"

CONFIG_DIR=""
# mktemp -d (when used) creates a 700 dir owned by the host user; the
# container runs as the non-root node user (UID 1000) and must be able to
# traverse and read the mount.
cleanup() {
    docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
    docker rmi "$IMAGE" >/dev/null 2>&1 || true
    if [ -n "$CONFIG_DIR" ]; then
        rm -rf "$CONFIG_DIR"
    fi
}
trap cleanup EXIT

# Wait until the app answers on /date_utc (always 200 when the server is up)
# or the container stops. /health is deliberately not used: it returns 503
# when MQTT is disconnected — which it will be in a sandbox. "Server is up"
# is the property under test.
wait_for_app() {
    local i
    for i in $(seq 1 60); do
        if curl -sf "http://localhost:$PORT/date_utc" >/dev/null 2>&1; then
            return 0
        fi
        if [ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null)" != "true" ]; then
            return 1
        fi
        sleep 1
    done
    return 1
}

echo "[1/4] Building image..."
docker build -t "$IMAGE" .
echo "      image built: $IMAGE"

echo "[2/4] Verifying the built-in configuration starts the app (no config mounted)..."
docker run -d --name "$CONTAINER" -p "$PORT:32000" "$IMAGE" >/dev/null

if ! wait_for_app; then
    echo "      FAILED: /date_utc never returned 200 with no config mounted; container logs:" >&2
    docker logs "$CONTAINER" >&2 || true
    exit 1
fi
# The built-in config.yml carries a non-empty db-password; /api/read-config
# (which reads the file directly) must report it, proving the built-in file
# is a complete configuration.
builtin_config="$(curl -sf "http://localhost:$PORT/api/read-config")"
if ! printf '%s' "$builtin_config" | grep -Eq '"db-password":"[^"]+"'; then
    echo "      FAILED: /api/read-config reports no db-password — the built-in config.yml is not a complete configuration:" >&2
    printf '%s' "$builtin_config" >&2
    exit 1
fi
echo "      app is up from the built-in config (read-config reports db-password)"
docker stop "$CONTAINER" >/dev/null
docker rm "$CONTAINER" >/dev/null

echo "[3/4] Verifying a mounted config takes precedence over the built-in one..."
CONFIG_DIR="$(mktemp -d)"
chmod 755 "$CONFIG_DIR"
# A complete mounted config: every required key present, with localhost values
# so any DB/MQTT connection fails fast (ECONNREFUSED) instead of timing out
# against an unroutable address. The db-password and
# command-silence-timeout-ms values are distinguishable from the built-in
# config's values, so the running config proves the mount won.
cat > "$CONFIG_DIR/config.yml" <<'YAML'
log-level: info
express-port: 32000
mqtt-broker-ip-address: "127.0.0.1"
mqtt-topic-command: "iot/v3/command"
mqtt-topic-command-response: "iot/v3/command-response"
ip-pinger-web-api: "http://127.0.0.1:32001"
case-sensitive: true
db-host: "127.0.0.1"
db-port: 5432
db-name: "sensor_web_services"
db-user: "appuser"
db-password: "verify-test-only-not-a-real-secret"
command-silence-timeout-ms: 4242
YAML
chmod 644 "$CONFIG_DIR/config.yml"

docker run -d --name "$CONTAINER" -p "$PORT:32000" \
    -v "$CONFIG_DIR:/app/configs:ro" "$IMAGE" >/dev/null

if ! wait_for_app; then
    echo "      FAILED: /date_utc never returned 200 with a mounted config; container logs:" >&2
    docker logs "$CONTAINER" >&2 || true
    exit 1
fi
mounted_config="$(curl -sf "http://localhost:$PORT/api/read-config")"
if ! printf '%s' "$mounted_config" | grep -q '"db-password":"verify-test-only-not-a-real-secret"'; then
    echo "      FAILED: read-config does not report the mounted db-password — the mount did not take precedence:" >&2
    printf '%s' "$mounted_config" >&2
    exit 1
fi
if ! printf '%s' "$mounted_config" | grep -q '"command-silence-timeout-ms":4242'; then
    echo "      FAILED: running config does not report the mounted command-silence-timeout-ms:" >&2
    printf '%s' "$mounted_config" >&2
    exit 1
fi
echo "      mounted config takes precedence (mounted db-password and marker key are active)"
docker stop "$CONTAINER" >/dev/null
docker rm "$CONTAINER" >/dev/null

echo "[4/4] Checking that Swagger initializes..."
docker run -d --name "$CONTAINER" -p "$PORT:32000" "$IMAGE" >/dev/null
if ! wait_for_app; then
    echo "      FAILED: /date_utc never returned 200; container logs:" >&2
    docker logs "$CONTAINER" >&2 || true
    exit 1
fi
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
