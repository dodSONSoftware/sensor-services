#!/bin/bash

# ---- initialize
__WORKING_DIRECTORY="/home/archive/setup-files/web-service-information"

__IMAGE_NAME="dodson/web-service-information"
__IMAGE_VERSION="1.0"
__CONTAINER_NAME="web-service-information"

__IMAGE_ID=$(docker image ls | grep "$__IMAGE_NAME" | cut -d " " -f11)
__CONTAINER_ID=$(docker container ls | grep "$__CONTAINER_NAME" | cut -d " " -f1)

__PORT=32000

cd "$__WORKING_DIRECTORY"

echo ----------------------------------------------------------------
echo "Image Id    : $__IMAGE_ID"
echo "Container Id: $__CONTAINER_ID"
echo "PWD         : $(pwd)"
echo ----------------------------------------------------------------



# ---- stop & remove container
if [ -n "$__CONTAINER_ID" ]; then
    echo ----------------------------------------------------------------
    echo  "Stopping and Removing the Docker Container"
    echo ----------------------------------------------------------------
    docker container stop $__CONTAINER_ID
    docker container rm $__CONTAINER_ID
fi



# ---- remove image
if [ -n "$__IMAGE_ID" ]; then
    echo ----------------------------------------------------------------
    echo  "Removing the Docker Image"
    echo ----------------------------------------------------------------
    docker image rm $__IMAGE_ID
fi


# ---- build it
echo ----------------------------------------------------------------
echo  "Building the Docker Image"
echo ----------------------------------------------------------------
docker build -t "$__IMAGE_NAME:$__IMAGE_VERSION" .



# ---- run it
echo ----------------------------------------------------------------
echo  "Running the Docker Image"
echo ----------------------------------------------------------------

# sudo docker run --detach -p 32000:32000 --restart unless-stopped --name web-service-information dodson/web-service-information:1.0

docker run \
    --detach \
    -p $__PORT:$__PORT \
    --restart unless-stopped \
    --name $__CONTAINER_NAME \
    $__IMAGE_NAME:$__IMAGE_VERSION

# ---- clean up
echo ----------------------------------------------------------------
echo  "Cleaning up any Dangling Docker Images"
echo ----------------------------------------------------------------
docker image prune -af

# ---- show docker image and container information
echo
echo ----------------------------------------------------------------
echo  "Displaying Docker Images and Containers"
echo ----------------------------------------------------------------
echo
docker image ls -a && echo && docker container ls -a

# ---- show container logs
__NEW_CONTAINER_ID=$(sudo docker container ls | grep "$__CONTAINER_NAME" | cut -d " " -f1)
echo
echo ----------------------------------------------------------------
echo  "Displaying Docker Container Logs after a short wait"
echo ----------------------------------------------------------------
echo
echo docker logs "$__NEW_CONTAINER_ID"
echo watch -n 1 \'docker logs "$__NEW_CONTAINER_ID"\'
echo watch -n 1 \'docker logs --tail 90 "$__NEW_CONTAINER_ID"\'
echo 
echo ----------------------------------------------------------------

# ---- wait-a-bit
sleep 5

# ---- show container logs
docker logs "$__NEW_CONTAINER_ID"
