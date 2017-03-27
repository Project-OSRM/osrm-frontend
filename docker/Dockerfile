FROM alpine:3.5

ENV BACKEND='http://localhost:5000'

RUN mkdir /src
COPY . /src
WORKDIR /src

RUN apk add --no-cache sed nodejs && \
    cd /src && \
    sed -i "s|https://router.project-osrm.org|${BACKEND}|g" src/leaflet_options.js && \
    sed -i "s|http://router.project-osrm.org|${BACKEND}|g" debug/index.html && \
    npm install

EXPOSE 9966
CMD ["npm", "start"]
