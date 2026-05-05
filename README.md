# osrm-frontend

This is the frontend served at https://map.project-osrm.org.
This frontend builds heavily on top of [Leaflet Routing Machine](https://github.com/perliedman/leaflet-routing-machine).
If you need a simple OSRM integration in your webpage, you should start from there.


## Using Docker

The easiest and quickest way to setup your own routing engine backend is to use Docker images we provide.
We base [our Docker images](https://github.com/Project-OSRM/osrm-frontend/pkgs/container/osrm-frontend/838858193?tag=latest) on Debian or Alpine Linux and make sure they are as lightweight as possible.

Serves the frontend at `http://localhost:9966` running queries against the routing engine backend:

```
docker run -p 9966:9966 ghcr.io/project-osrm/osrm-frontend:latest
```

By default Docker uses a single routing profile named `default` and sends requests to `http://localhost:5000`.

### Recommended: multiple profiles with `OSRM_MODES`

`OSRM_MODES` is the current Docker runtime configuration interface. It accepts a JSON array of objects with `name` and `url` fields.

```bash
docker run -p 9966:9966 \
  -e 'OSRM_MODES=[{"name":"car","url":"https://routing.openstreetmap.de/routed-car"},{"name":"foot","url":"https://routing.openstreetmap.de/routed-foot"},{"name":"bike","url":"https://routing.openstreetmap.de/routed-bike"}]' \
  ghcr.io/project-osrm/osrm-frontend:latest
```

### Deprecated: single backend with `OSRM_BACKEND`

`OSRM_BACKEND` is deprecated. It is still supported for backward compatibility and configures exactly one backend named `default`.

```bash
docker run -p 9966:9966 \
  -e OSRM_BACKEND='http://localhost:5001' \
  ghcr.io/project-osrm/osrm-frontend:latest
```

### Precedence

1. If only `OSRM_BACKEND` is set, the frontend configures one backend and emits a deprecation warning.
2. If only `OSRM_MODES` is set, the frontend parses the JSON and configures the listed modes.
3. If both are set, `OSRM_MODES` wins and the frontend emits a deprecation warning for `OSRM_BACKEND`.

In case Docker complains about not being able to connect to the Docker daemon make sure you are in the `docker` group.

```
sudo usermod -aG docker $USER
```

To build the docker image locally:

```bash
docker build -f docker/Dockerfile -t osrm-frontend .
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

For Docker deployments, prefer runtime configuration via `OSRM_MODES` instead of editing source files.

For source-level customization, adjust `src/leaflet_options.js`:

```
services: [{
  label: 'Car (fastest)',
  path: 'http://localhost:5000/route/v1'
}],
```

For debug tiles showing speeds and small components available at `/debug` adjust in `debug/index.html`

```
"osrm": {
  "type": "vector",
  "tiles" : ["http://localhost:5000/tile/v1/car/tile({x},{y},{z}).mvt"]
}
```
