#!/bin/bash

# Sync local config.yml to the Docker mount point (source of truth)
sudo cp "$(dirname "$0")/src/config.yml" /mnt/sensor-services/config.yml

# Sync local config-secrets.yml too — the committed config.yml is intentionally
# secret-free, so without this the container exits at startup with
# "db-password must be a string" (the mount needs the secrets sibling file).
if [ -f "$(dirname "$0")/src/config-secrets.yml" ]; then
    sudo cp "$(dirname "$0")/src/config-secrets.yml" /mnt/sensor-services/config-secrets.yml
else
    echo "WARNING: src/config-secrets.yml not found — the container will fail startup validation (missing db-password)."
fi

# Stop and remove the running container
docker compose down

# Remove the existing image so a fresh build is forced
docker rmi code-sensor-services:latest

# Rebuild and start the container in detached mode
docker compose up -d

# Wait a bit for things to settle
echo "waiting..."
sleep 7

# Verify the new container is running
docker ps

# Output the logs
echo
docker logs -f sensor-services
