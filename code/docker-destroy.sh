#!/bin/bash

echo "Docker stopping container: sensor-web-services"
docker container stop sensor-web-services

echo
echo "Docker removing container: sensor-web-services"
docker container rm sensor-web-services

echo
echo "Docker removing image: sensor-web-services:1.0"
docker image rm sensor-web-services:1.0

echo
echo "Docker pruning images"
docker image prune -af

sleep 3

echo
echo "----"
docker image ls -a
echo
docker container ls -a
