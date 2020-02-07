#!/bin/sh

set -x

IMAGE_NAME=demisto-incident-importer
DOCKER_USER=tundisto
REGISTRY=docker.io

VERSION=`grep version package.json | head -1 | awk -F: '{ print $2 }' | sed 's/[",]//g' | tr -d '[[:space:]]'`
MAJOR=$(echo $VERSION | cut -d'.' -f1)
MINOR=$(echo $VERSION | cut -d'.' -f2)
PATCH=$(echo $VERSION | cut -d'.' -f3)

# install modules
npm install
if [ ! $? -eq 0 ]; then
  echo "'npm install' failed"
  exit 1
fi

# build client
npm run build
if [ ! $? -eq 0 ]; then
  echo "'npm run build' failed"
  exit 1
fi

# build docker image
docker build -t ${IMAGE_NAME}:${VERSION} -t ${REGISTRY}/${DOCKER_USER}/${IMAGE_NAME}:${VERSION} -t ${IMAGE_NAME}:latest -t ${REGISTRY}/${DOCKER_USER}/${IMAGE_NAME}:latest  .
if [ ! $? -eq 0 ]; then
  echo "'docker build' failed"
  exit 1
fi

docker push ${REGISTRY}/${DOCKER_USER}/${IMAGE_NAME}:${VERSION}
docker push ${REGISTRY}/${DOCKER_USER}/${IMAGE_NAME}:latest