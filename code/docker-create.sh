#!/bin/bash

echo "Docker building docker image: sensor-web-services"
docker build -t sensor-web-services:1.0 --no-cache .

echo
echo "Docker running docker container: sensor-web-services"

# running a docker container in privileged mode is not ideal; further research is needed.
docker run -d \
           --privileged \
           --name sensor-web-services \
           -p 3301:3301 \
           -v /var/run/docker.sock:/var/run/docker.sock \
           -v /mnt/sensor-web-services/config.json:/app/dist/config.json \
           sensor-web-services:1.0

sleep 3

echo
echo "----"
docker image ls -a
echo
docker container ls -a
