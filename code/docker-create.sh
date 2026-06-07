#!/bin/bash

echo "Docker building docker image: sensor-web-services"
docker build -t sensor-web-services:1.0 --no-cache .

echo
echo "Docker running docker container: sensor-web-services"

# No special capabilities needed — the app only requires network access
# (MQTT broker, external HTTP APIs) and reads config from a mounted file.
docker run -d \
           --name sensor-web-services \
           -p 3301:3301 \
           -v /mnt/sensor-web-services/config.yml:/app/dist/config.yml \
           sensor-web-services:1.0

sleep 3

echo
echo "----"
docker image ls -a
echo
docker container ls -a
