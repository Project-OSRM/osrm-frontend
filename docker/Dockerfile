FROM alpine:3.8

# Enables customized options using environment variables
ENV OSRM_BACKEND='http://localhost:5000'
ENV OSRM_CENTER='38.8995,-77.0269'
ENV OSRM_ZOOM='13'
ENV OSRM_LANGUAGE='en'
ENV OSRM_LABEL='Car (fastest)'
ENV OSRM_MAPBOX_TOKEN='pk.eyJ1IjoibXNsZWUiLCJhIjoiclpiTWV5SSJ9.P_h8r37vD8jpIH1A6i1VRg'

# Copy package.json
RUN mkdir -p /src
COPY package.json /src

# Install app dependencies
RUN apk add --no-cache sed nodejs su-exec npm && \
    cd /src && \
    npm install

# Create app directory
COPY . /src
WORKDIR /src

# for dropping privileges
RUN adduser -D osrm && \
    chown -R osrm /src

# Run App
EXPOSE 9966
CMD ["su-exec", "osrm", "npm", "start"]
