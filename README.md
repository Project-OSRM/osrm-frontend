# osrm-frontend

This is the frontend served at https://map.project-osrm.org.
This frontend builds heavily on top of [Leaflet Routing Machine](https://github.com/perliedman/leaflet-routing-machine).
If you need a simple OSRM integration in your webpage, you should start from there.


## Using Docker

The easiest and quickest way to setup your own routing engine backend is to use Docker images we provide.
We base [our Docker images](https://hub.docker.com/r/osrm/osrm-frontend/) on Alpine Linux and make sure they are as lightweight as possible.

Serves the frontend at `http://localhost:9966` running queries against the routing engine backend:

```
docker run -p 9966:9966 ghcr.io/project-osrm/osrm-frontend:latest
```

By default, the docker container uses the settings in `config/config.json` file. If you'd like to provide a custom config file (with your own backend server, layers and overlays), you can run the container with the following command:

```
docker run -p 9966:9966 -v ./YOUR_CONFIG.json:/src/config/config.json osrm-frontend
```

In case Docker complains about not being able to connect to the Docker daemon make sure you are in the `docker` group.

```
sudo usermod -aG docker $USER
```

To build the docker image locally:

```bash
docker build . -f docker/Dockerfile -t osrm-frontend
docker run -p 9966:9966 osrm-frontend
```

## Development

Install dependencies via

```bash
npm install
```

Then compile assets and start the local server with

```bash
npm start
```

On Windows with no Unix tools installed (`bash` and `cp`) the server could be started with two other commands
executed by `npm start` internally:

```bash
npm run compile
npm run start-index
```

## Changing Backends

In `config/config.json` add or adjust your own services:

```
services: [{
  label: 'Car',
  path: 'http://localhost:5000/route/v1'
}],
```

You can also adjust your own layers and overlays.

## Debug
> Note: "debug" pages currently do not work "out of the box" and require manual configuration

For debug tiles showing speeds and small components available at `/debug` adjust in `debug/index.html`

```
"osrm": {
  "type": "vector",
  "tiles" : ["http://localhost:5000/tile/v1/car/tile({x},{y},{z}).mvt"]
}
```
