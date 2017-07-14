FROM alpine:3.5

# Enables customized options using environment variables
ENV BACKEND='http://router.project-osrm.org'
ENV CENTER='38.8995,-77.0269'
ENV ZOOM='13'
ENV LANGUAGE='en'
ENV LABEL='Car (fastest)'

# Copy package.json
RUN mkdir -p /src
COPY package.json /src

# Install app dependencies
RUN apk add --no-cache sed nodejs && \
    cd /src && \
    npm install

# Create app directory
COPY . /src
WORKDIR /src

# Run App
EXPOSE 9966
CMD ["npm", "start"]
