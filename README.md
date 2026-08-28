# osrm-frontend

This is the frontend served at https://map.project-osrm.org.
This frontend builds heavily on top of [Leaflet Routing Machine](https://github.com/perliedman/leaflet-routing-machine).
If you need a simple OSRM integration in your webpage, you should start from there.


## Using Docker

The easiest and quickest way to setup your own routing engine backend is to use Docker images we provide.
We base [our Docker images](https://github.com/Project-OSRM/osrm-frontend/pkgs/container/osrm-frontend) on Alpine Linux and make sure they are as lightweight as possible.

Serves the frontend at `http://localhost:9966` running queries against the routing engine backend:

```
docker run -p 9966:9966 ghcr.io/project-osrm/osrm-frontend:latest
```

By default Docker uses a single routing profile named `default` and sends requests to `http://localhost:5000`.

### Recommended: multiple profiles with `OSRM_MODES`

`OSRM_MODES` is the current Docker runtime configuration interface. It accepts a JSON array of objects
with the following fields:

| Field      | Required | Purpose |
|------------|----------|---------|
| `name`     | yes      | Label shown in the mode selector. |
| `url`      | yes      | Backend base URL. `/route/v1` is appended unless `path` is set. |
| `path`     | no       | Explicit routing path, e.g. `https://routing.openstreetmap.de/routed-bike/route/v1`. |
| `profile`  | no       | Internal profile (`driving`, `bike`, `foot`). Defaults by position: 0 → driving, 1 → bike, 2 → foot. |
| `debugUrl` | no       | Debug map opened by the "Open in Debug Map" tool button while this mode is active. Defaults to the bundled `debug/`. |

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

### Backends behind HTTP authentication

The frontend has no configuration option for backend credentials, and embedding them in the
backend URL (`https://user:password@example.com`) does not work: browsers refuse to send
credentials embedded in subresource URLs, so the request either fails with `401` or never
completes. This is browser policy and cannot be worked around from the page. Credentials placed
in `OSRM_MODES` would also end up in `config.json`, readable by everyone who loads the frontend.

The supported approach is to keep the credentials on the server side, behind a reverse proxy that
serves the frontend and the routing endpoint from the same origin. With nginx:

```nginx
location /osrm/ {
    proxy_pass https://osrm.internal.example.com/;
    proxy_set_header Authorization "Basic <base64 of user:password>";
}
```

Then point a mode at the proxied path instead of at the backend directly. Relative URLs are
supported and produce same-origin requests:

```bash
docker run -p 9966:9966 \
  -e 'OSRM_MODES=[{"name":"car","url":"/osrm"}]' \
  ghcr.io/project-osrm/osrm-frontend:latest
```

If the proxy has to live on a different origin than the frontend, it must answer the CORS
preflight (`OPTIONS`) request *without* requiring authentication, and include
`Access-Control-Allow-Headers: authorization` in the response. Otherwise the browser rejects the
routing request before it is ever sent.

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

For Docker deployments, prefer runtime configuration via `OSRM_MODES` (see [above](#recommended-multiple-profiles-with-osrm_modes))
instead of editing source files. If you need source-level customization, edit the
`parseModes()` and `buildServices()` functions in `src/leaflet_options.js`.

## Customizing Tile Layers and Overlays

### Base layers (`layer`)

The `layer` property in `src/leaflet_options.js` defines the base tile layers
shown as radio buttons in the map's layer control (bottom-left corner).

**Default base layers:**

| Label | Source | Max zoom |
|-------|--------|----------|
| Streets | [CartoDB Voyager](https://carto.com/) | 19 |
| Outdoors | [OpenTopoMap](https://opentopomap.org/) | 17 |
| Satellite | [ESRI World Imagery](https://www.esri.com/) | 19 |
| openstreetmap.org | [OSM](https://openstreetmap.org/) | 19 |
| openstreetmap.de | [OSM.de](https://openstreetmap.de/) | 19 |

**Changing the default layer for Docker deployments:**
Set `OSRM_DEFAULT_LAYER` to one of: `streets`, `outdoors`, `satellite`, `osm`, `osm_de`.
```bash
docker run -p 9966:9966 -e OSRM_DEFAULT_LAYER=satellite ghcr.io/project-osrm/osrm-frontend:latest
```

**Adding or replacing base layers (source builds):**
Define a new `L.tileLayer` and add it to the `layer` array in `src/leaflet_options.js`:
```js
var myTiles = L.tileLayer('https://example.com/tiles/{z}/{x}/{y}.png', {
    attribution: '© My Tile Provider',
    maxZoom: 18
});

// In the leafletOptions object:
layer: [{
    'My Custom Map': myTiles,
    'Streets': streets,
    'Outdoors': outdoors,
    // ... other layers
}]
```

### Overlays (`overlay`)

Overlays are toggleable tile layers rendered on top of the base layer. They
appear as checkboxes in the layer control.

| Overlay | Source | Description |
|---------|--------|-------------|
| Hiking | [Waymarked Trails](https://waymarkedtrails.org/) | Hiking routes overlay (CC-BY-SA) |
| Bike | [Waymarked Trails](https://waymarkedtrails.org/) | Cycling routes overlay (CC-BY-SA). **Auto-activated** when a bike profile is selected. |
| Small Components | [GeoFabrik OSM Inspector](https://tools.geofabrik.de/osmi/tiles/routing/) | Debug overlay highlighting small disconnected road segments. Useful for checking OSM data quality. |

The user's overlay preference is saved in localStorage and restored on reload.

**Adding custom overlays:** Define a `L.tileLayer` and add an entry to the
`overlay` object in `src/leaflet_options.js`:
```js
overlay: {
    'Hiking': hiking,
    'Bike': bike,
    'Small Components': small_components,
    'My Overlay': L.tileLayer('https://example.com/overlay/{z}/{x}/{y}.png', {})
}
```

For debug tiles showing speeds and small components available at `/debug` adjust in `debug/index.html`

```
"osrm": {
  "type": "vector",
  "tiles" : ["http://localhost:5000/tile/v1/car/tile({x},{y},{z}).mvt"]
}
```

The bundled debug map serves a single tile source, so it can only ever match one profile. Since each
routing mode usually needs its own debug view, the link behind the "Open in Debug Map" button is
configurable per mode via `debugUrl`. Deploy one debug map per profile and point each mode at its own:

```bash
docker run -p 9966:9966 \
  -e 'OSRM_MODES=[
        {"name":"car","url":"http://localhost:5000","debugUrl":"debug-car/"},
        {"name":"bike","url":"http://localhost:5001","debugUrl":"https://debug.example.com/bike/"}
      ]' \
  ghcr.io/project-osrm/osrm-frontend:latest
```

Relative URLs resolve against the frontend origin (so `debug-car/` under a `/osrm-frontend/` deployment
becomes `/osrm-frontend/debug-car/`); absolute URLs are used as-is. In both cases the current map
position is appended as a `#zoom/lat/lng` hash, exactly as with the bundled debug map. A mode without
`debugUrl` keeps opening the bundled `debug/`.
