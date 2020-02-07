# Create a container: docker create -p 4002:4002 --name demisto-incident-importer tundisto/demisto-incident-importer:latest
# Start the conatiner: docker start demisto-incident-importer
# Stop the container: docker stop demisto-incident-importer
# Run a temporary container: docker run -p 4002:4002 -ti --rm tundisto/demisto-incident-importer:latest

FROM node:latest
ENV DESTDIR /opt/demisto/demisto-incident-importer
WORKDIR $DESTDIR
ARG IMPORTER_DEBUG
EXPOSE 4002/tcp

COPY dist/ ${DESTDIR}/dist/
COPY server/ ${DESTDIR}/server/
COPY package.json ${DESTDIR}/package.json

RUN \
cd ${DESTDIR} \
&& npm install

WORKDIR ${DESTDIR}/server/src
CMD ["/bin/sh", "-c", "node server.js"]