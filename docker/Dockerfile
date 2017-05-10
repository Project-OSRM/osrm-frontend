FROM alpine:3.5

ENV BACKEND='http://localhost:5000'

RUN mkdir /src
COPY . /src
WORKDIR /src

RUN apk add --no-cache sed nodejs && \
    cd /src && \
    npm install

EXPOSE 9966
CMD ["npm", "start"]
