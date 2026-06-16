#!/bin/bash

docker compose down

docker rmi code-sensor-web-services:latest

docker compose up -d
