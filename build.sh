#!/bin/sh

set -ex

IMAGE_NAME=xsoar-incident-creator
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

# copy ace editor files to assets dir
npm run fixdeps

# build client
npm run build
if [ ! $? -eq 0 ]; then
  echo "'npm run build' failed"
  exit 1
fi

docker pull node:lts-alpine # fetch latest image

# build docker image
docker build --no-cache=true -t ${IMAGE_NAME}:${VERSION} -t ${IMAGE_NAME}:latest .
if [ ! $? -eq 0 ]; then
  echo "'docker build' failed"
  exit 1
fi

if [[ "$GIT_BRANCH" == "origin/master" || "$DOCKER_HUB_FORCE_PUSH" == "true" ]]; then
  # we only push master builds to docker hub
  docker tag ${IMAGE_NAME}:${VERSION} ${REGISTRY}/${DOCKER_USER}/${IMAGE_NAME}:${VERSION}
  docker tag ${IMAGE_NAME}:${VERSION} ${REGISTRY}/${DOCKER_USER}/${IMAGE_NAME}:latest

  docker push ${REGISTRY}/${DOCKER_USER}/${IMAGE_NAME}:${VERSION}
  docker push ${REGISTRY}/${DOCKER_USER}/${IMAGE_NAME}:latest
fi
