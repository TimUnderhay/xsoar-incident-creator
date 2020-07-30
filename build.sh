#!/bin/sh

set -ex

IMAGE_NAME=xsoar-incident-creator
DOCKER_USER=tundisto
REGISTRY=docker.io
BRANCH=$(sed -E 's/origin\/(.*)/\1/g' <<< $GIT_BRANCH) # remove 'origin/' from branch name

VERSION=`grep version package.json | head -1 | awk -F: '{ print $2 }' | sed 's/[",]//g' | tr -d '[[:space:]]'`
MAJOR=$(echo $VERSION | cut -d'.' -f1)
MINOR=$(echo $VERSION | cut -d'.' -f2)
PATCH=$(echo $VERSION | cut -d'.' -f3)

echo -n {\"buildNumber\": $BUILD_NUMBER} > build.json
cp build.json server/
sed -i'' "s/\"version\": \"[^/]+\",/\"version\": \"$VERSION\",/g" server/package.json  # the main package.json version is used for the server

# install modules
npm install
if [ ! $? -eq 0 ]; then
  echo "'npm install' failed"
  exit 1
fi

# copy ace editor files to assets dir
npm run fixdeps

# build client
if [[ "$BRANCH" == 'master' || "$BRANCH" == 'release' || "$FORCE_PROD_BUILD" == 'true' ]]; then
  npm run build-prod
else
  npm run build-dev
fi
if [ ! $? -eq 0 ]; then
  echo "'npm run build' failed"
  exit 1
fi

# fetch latest image
docker pull node:lts-alpine 

# build docker image
docker build --no-cache=true -t ${IMAGE_NAME}:${VERSION} -t ${IMAGE_NAME}:latest .
if [ ! $? -eq 0 ]; then
  echo "'docker build' failed"
  exit 1
fi

if [[ "$GIT_BRANCH" == "origin/master" || "$DOCKER_HUB_FORCE_PUSH" == "true" ]]; then
  # we only push master builds to docker hub by default
  docker tag ${IMAGE_NAME}:${VERSION} ${REGISTRY}/${DOCKER_USER}/${IMAGE_NAME}:${VERSION}
  docker tag ${IMAGE_NAME}:${VERSION} ${REGISTRY}/${DOCKER_USER}/${IMAGE_NAME}:latest

  docker push ${REGISTRY}/${DOCKER_USER}/${IMAGE_NAME}:${VERSION}
  docker push ${REGISTRY}/${DOCKER_USER}/${IMAGE_NAME}:latest
fi

docker save ${IMAGE_NAME}:${VERSION} | gzip > xsoar-incident-creator_${VERSION}b${BUILD_NUMBER}_${BRANCH}.tgz