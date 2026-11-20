# osrm-frontend

This is the frontend served at https://map.project-osrm.org.
This frontend builds heavily on top of [Leaflet Routing Machine](https://github.com/perliedman/leaflet-routing-machine).
If you need a simple OSRM integration in your webpage, you should start from there.


## Deploying the demo to GitHub Pages

The `Deploy demo to GitHub Pages` workflow builds and publishes `dist-demo/` on each
push to `gh-pages`, including every pull request merge. Lint, build and tests must
pass before the site is uploaded and deployed. You can also run it from the
Actions tab with `gh-pages` selected;
other branches are skipped. Deployment runs are serialized, and the published
URL appears in the `github-pages` deployment environment.

The classic demo remains the default at `/`. The new vector demo is available
at `/new/`. Both include their own `debug/` viewer and use the public services
configured in the frontend. The links between editions carry stops, routing
settings and the current map view.

Run `npm run build` followed by `npm run assemble:demo-site` from a clone that
contains the classic commit pinned in `scripts/build_demo_site.sh`. The
assembly step builds the classic source with `deploy/classic-demo.patch` and
combines it with the vector build. Serve `dist-demo/` with a static server to
check both paths before publishing. GitHub Actions uploads this directory
without committing generated files to `gh-pages`.

### One-time setup

1. In repository **Settings → Pages → Build and deployment**, set **Source** to
   **GitHub Actions** (rather than deploying directly from a branch).
2. Ensure the `github-pages` environment permits deployments from `gh-pages`.
   For fully automatic deployment, do not require manual reviewer approval on
   that environment.
3. Merge the workflow into `gh-pages` through a pull request. Pushes then deploy
   automatically; use the manual trigger to retry a deployment.

No additional secrets or API tokens are needed. The deploy job uses GitHub's
built-in token with `pages: write` and `id-token: write` permissions; the build
job has read-only repository access. See GitHub's
[custom Pages workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

### Custom domain with external DNS

Keep your existing DNS provider and configure a subdomain such as
`map.example.com`:

1. In repository **Settings → Pages → Custom domain**, enter the hostname and
   save it before updating DNS.
2. At your DNS provider, create a CNAME from the hostname (e.g. `map`) to
   `<owner>.github.io` — for this repository, `project-osrm.github.io`. Do not
   include the repository name, `https://`, or a path. Replace any conflicting
   records for that hostname.
3. Wait for GitHub's DNS check and certificate provisioning to finish, then
   enable **Enforce HTTPS** and verify the demo and `debug/` on the custom domain.

A `CNAME` file is not required when publishing with a custom Actions workflow;
configure the domain in repository settings. Apex domains such as `example.com`
also work with external DNS, using GitHub's documented A/AAAA records or an
ALIAS/ANAME record. See the
[custom domain instructions](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site).

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
| `tileUrl` | no | Component vector tile URL template with `{x}`, `{y}`, `{z}` and optional `{profile}`. Set `false` to disable tiles for this mode. Standard `/route/v1` paths infer the sibling `/tile/v1` endpoint; custom paths require this field. |
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

### Vector backgrounds

The static demo uses Shortbread vector tiles from `vector.openstreetmap.org`.
OpenStreetMap and Dark Vector share one renderer and tile cache: switching between
them changes the palette without reloading tiles. Switching to another provider
hides and pauses the vector renderer, retaining its loaded tiles for the return
trip. The cache lasts for the current page session. Dark Vector uses the dark palette;
OpenStreetMap uses the original light style. Docker defaults to the classic
CARTO Streets raster layer. Set `OSRM_VECTOR_STYLE` to opt in to a vector source.

Set `OSRM_VECTOR_STYLE` to an HTTP(S) or root-relative MapLibre style JSON URL,
or `images/openstreetmap/style.json` for the built-in shared OSM backgrounds.
The style specifies vector tile sources, fonts, sprites and their attribution.
`OSRM_VECTOR_NAME` names the layer in the layer control (default: `Dark Vector`);
`OSRM_VECTOR_ATTRIBUTION` adds any required provider credit. Set these keys in
`window.osrmConfig` for a static deployment, or as Docker environment variables.

```bash
docker run -p 9966:9966 \
  -e OSRM_VECTOR_STYLE=https://tiles.example.com/style.json \
  -e OSRM_VECTOR_NAME='Local vector' \
  ghcr.io/project-osrm/osrm-frontend:latest
```

Dark Vector uses the configured vector style with the selected theme. OpenStreetMap
shares the built-in Shortbread source with Dark Vector in the static demo. The
layer menu lists OpenStreetMap, Dark Vector, OpenStreetMap.de, Satellite and Outdoors,
in that order (Dark Vector appears when configured). OpenStreetMap is the demo default.

The renderer is loaded only when a vector background is selected. It starts
directly on a plain background without loading raster tiles underneath. If the
renderer or style cannot load, a retry control appears; another background can
also be selected from the layer control. Styles hosted on another origin must allow CORS requests for
the style and its tile, font and sprite resources. A configured vector background
is the default unless `OSRM_DEFAULT_LAYER` selects another layer.

Dark Vector uses a dark slate palette with blue water and muted green land cover.
The translucent grey directions sidebar has blue route cards, expandable
instructions and selectable duration labels on the map.
The sidebar stays beside the map on desktop and becomes a bottom sheet on smaller
screens. The map extends behind the translucent panel; route and entrance fitting reserve
the unobscured area beside the sidebar or above the mobile sheet.
Set `OSRM_VECTOR_THEME=original` to keep the provider's original colors and the
classic interface. The dark theme preserves vector source attribution, fonts,
labels and road geometry; it removes raster backdrop layers from the vector style.

### Route options

Open **Route options** below the waypoint inputs to exclude a comma-separated list
of road classes, such as `motorway,toll,ferry`, or allow U-turns at via points.
The backend's routing profile determines which classes and combinations it supports;
unsupported exclusions are reported as routing errors. By default no classes are
excluded and routes continue straight at via points where possible.

These settings travel in shared links as `exclude=motorway,toll` and `u=true`.
Browser Back and Forward restore them along with the waypoints.

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

## Geocoding

Address search and the reverse lookups that name dropped or dragged waypoints go
to the public [Nominatim](https://nominatim.openstreetmap.org/) instance by
default. `OSRM_GEOCODERS` decides which geocoders a deployment offers — a JSON
array shaped like `OSRM_MODES`:

```bash
docker run -p 9966:9966 \
  -e 'OSRM_GEOCODERS=[{"name":"House Nominatim","url":"https://nominatim.internal/"}]' \
  ghcr.io/project-osrm/osrm-frontend:latest
```

An entry whose `url` is empty is the **coordinates-only** geocoder: it contacts
nothing at all. The search box still accepts typed coordinates, and waypoints are
named by their coordinates (`34.129382, -118.141254`) — a form that pastes back
into the search box. Configure it alone when the deployment may not reach a
third-party geocoder:

```bash
docker run -p 9966:9966 -e 'OSRM_GEOCODERS=[{"url":""}]' ghcr.io/project-osrm/osrm-frontend:latest
```

| Field | Default | Description |
|-------|---------|-------------|
| `name` | `Geocoder <n>`, or `Coordinates only` for an empty `url` | Display name. |
| `url` | — | Nominatim endpoint. Empty means no geocoding at all. |

The first entry is the one in use. With `OSRM_GEOCODERS` unset, the single entry
is the Nominatim instance baked in at build time via `NOMINATIM_ENDPOINT`.

## Customizing Tile Layers and Overlays

### Base layers (`layer`)

The `layer` property in `src/leaflet_options.js` defines the base tile layers
shown as radio buttons in the map's layer control (bottom-left corner).

**Default base layers:**

| Label | Source | Max zoom |
|-------|--------|----------|
| OpenStreetMap | [OSM Shortbread vector](https://vector.openstreetmap.org/styles/shortbread/) (demo default) | 22 |
| Dark Vector | [OSM Shortbread vector](https://vector.openstreetmap.org/) with dark palette (static demo) | 22 |
| OpenStreetMap.de | [OSM.de](https://openstreetmap.de/) | 19 |
| Satellite | [ESRI World Imagery](https://www.esri.com/) | 19 |
| Outdoors | [OpenTopoMap](https://www.opentopomap.org/) | 17 |

**Changing the default layer for Docker deployments:**
Docker uses CARTO Voyager for `streets` and OpenStreetMap raster tiles for `osm`.
Set `OSRM_CARTO_KEY` to your deployment's CARTO key for Streets. Set
`OSRM_DEFAULT_LAYER` to `osm`, `outdoors`, `satellite`, or `osm_de` to select
another raster layer. With `OSRM_VECTOR_STYLE` configured, the vector style
becomes the default and is also available as `vector`, `dark_vector`, or `standard`.
```bash
docker run -p 9966:9966 -e OSRM_DEFAULT_LAYER=satellite ghcr.io/project-osrm/osrm-frontend:latest
```

**Using your own tile server (`OSRM_TILE_URL`):**
A self-hosted or offline deployment cannot reach the public tile providers above.
Point `OSRM_TILE_URL` at your own tile server and the frontend adds it as an extra
base layer — no source edit, no rebuild:

```bash
docker run -p 9966:9966 \
  -e 'OSRM_TILE_URL=http://localhost:8080/tile/{z}/{x}/{y}.png' \
  -e 'OSRM_TILE_NAME=Local tiles' \
  ghcr.io/project-osrm/osrm-frontend:latest
```

| Variable | Default | Description |
|----------|---------|-------------|
| `OSRM_TILE_URL` | — | Tile URL template. Must be an http(s), protocol-relative or root-relative URL carrying the `{z}`, `{x}` and `{y}` placeholders; anything else is ignored with a console warning. |
| `OSRM_TILE_NAME` | `Custom` | Label shown in the layer control. |
| `OSRM_TILE_ATTRIBUTION` | OpenStreetMap credit | Attribution text for the layer. |

Setting `OSRM_TILE_URL` also makes that layer the default, since a deployment
serving its own tiles is usually offline. Set `OSRM_DEFAULT_LAYER` explicitly to
override — `custom` selects the tile layer, the other keys the built-in ones.

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
    'OpenStreetMap': osm,
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
| Small Components | Active OSRM backend, `speeds` vector layer | Highlights only segments with boolean `is_small: true`, using the selected mode’s graph and extraction threshold. Available at Leaflet zoom 13 and above (OSRM tile zoom 12). |

The Small Components checkbox is saved separately from the trail overlays and
restored on reload, including when Bike is auto-enabled. Changing modes or
restoring a mode from browser history updates the tile source without changing
the checkbox. This layer does not use OSM Inspector diagnostics: legitimate
connected dead ends are not highlighted merely for having an endpoint.

For a reverse proxy, `/proxy/route/v1` resolves to
`/proxy/tile/v1/{profile}/tile({x},{y},{z}).mvt`. Custom routing paths should set
an explicit per-mode template, for example:

```json
[{"name":"Car","url":"https://router.example/proxy","path":"https://router.example/custom/route","profile":"driving","tileUrl":"https://router.example/proxy/tile/v1/{profile}/tile({x},{y},{z}).mvt"}]
```

The same `OSRM_MODES` JSON works in `window.osrmConfig`, the Docker environment,
or a mounted `modes.json`; Docker passes through `tileUrl` without rewriting it.
Use `"tileUrl": false` when a backend does not expose vector tiles. Unsupported
or failing tile services display an unavailable message, with no external
fallback. A mode's `debugUrl` is independent of its `tileUrl`.

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
