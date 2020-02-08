# Create a container: docker create -p 4002:4002 --name demisto-incident-importer tundisto/demisto-incident-importer:latest
# Start the conatiner: docker start demisto-incident-importer
# Stop the container: docker stop demisto-incident-importer
# Run a temporary container: docker run -p 4002:4002 -ti --rm tundisto/demisto-incident-importer:latest

FROM node:lts-alpine
ENV DSTDIR /opt/demisto/demisto-incident-importer
WORKDIR $DSTDIR
ARG IMPORTER_DEBUG
EXPOSE 4002/tcp

COPY dist/ ${DSTDIR}/dist/
COPY server/ ${DSTDIR}/server/
COPY package-node.json ${DSTDIR}/package.json

# unset the entrypoint set in the base image
ENTRYPOINT []

RUN \
apk add bash \
&& ln -sf /bin/bash /bin/sh \
&& cd ${DSTDIR} \
&& npm install

WORKDIR ${DSTDIR}/server/src
# a dummy command is needed prior to main command due to bash optimisation which runs exec and replaces the shell, if there is only a single command.  This fixes ctrl-c termination in alpine
CMD ["/bin/sh", "-c", "dummy=0; node server.js"]