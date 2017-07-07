FROM alpine:3.5

# Enables customized options using environment variables
ENV BACKEND='http://localhost:5000'
ENV CENTER='38.8995,-77.0269'
ENV ZOOM='13'
ENV LANGUAGE='en'
ENV LABEL='Car (fastest)'

# Create app directory
RUN mkdir /src
COPY . /src
WORKDIR /src

# Install app dependencies
RUN apk add --no-cache sed nodejs && \
    cd /src && \
    npm install

# Run App
EXPOSE 9966
CMD ["npm", "start"]
