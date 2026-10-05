#!/bin/bash

# Sync local config.yml to the Docker mount point (source of truth)
sudo cp "$(dirname "$0")/src/config.yml" /mnt/sensor-services/config.yml

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
