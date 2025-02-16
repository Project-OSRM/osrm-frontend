FROM alpine:3.21

# Copy package.json
RUN mkdir -p /src
COPY package.json /src

# Install app dependencies
RUN apk add --no-cache npm && \
    cd /src && \
    npm install

# Create app directory
COPY . /src
WORKDIR /src

# Run App
EXPOSE 9966
CMD ["npm", "start"]
