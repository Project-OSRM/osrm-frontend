# osrm-frontend

This is the frontend served at https://map.project-osrm.org.
This frontend builds heavily on top of [Leaflet Routing Machine](https://github.com/perliedman/leaflet-routing-machine).
If you need a simple OSRM integration in your webpage, you should start from there.

## Development

Install dependencies via

```bash
npm install
```

Then compile the assets and start a server with

```bash
npm start
```


## Changing Backends

In `src/leaflet_options.js` adjust:

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
