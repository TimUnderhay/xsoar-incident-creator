# Create a container: docker create -p 4002:4002 --name xsoar-incident-creator tundisto/xsoar-incident-creator:latest
# Start the conatiner: docker start xsoar-incident-creator
# Stop the container: docker stop xsoar-incident-creator
# Run a temporary container: docker run -p 4002:4002 -ti --rm tundisto/xsoar-incident-creator:latest

FROM node:lts-alpine
ENV DSTDIR /opt/xsoar/xsoar-incident-creator
WORKDIR $DSTDIR
ARG CREATOR_DEBUG
EXPOSE 4002/tcp

COPY dist/ ${DSTDIR}/dist/
COPY server/ ${DSTDIR}/server/

# unset the entrypoint set in the base image
ENTRYPOINT []

RUN \
set -o xtrace \
&& apk add bash \
&& ln -sf /bin/bash /bin/sh \
&& cd ${DSTDIR} \
&& mv -f server/package-prod.json ./package.json \
&& rm -f server/package.json \
&& rm -rf server/etc/* \
&& npm install

WORKDIR ${DSTDIR}/server/src
# a dummy command is needed prior to main command due to bash optimisation which runs exec and replaces the shell, if there is only a single command.  This fixes ctrl-c termination in the Alpine Linux image
CMD ["/bin/sh", "-c", "NOOP=0; node server.js"]