This is the frontend served at https://map.project-osrm.org.

This frontend is builds heavily ontop of [Leaflet Routing Machine](https://github.com/perliedman/leaflet-routing-machine). If you need a simple OSRM integration in your webpage, you should start from there.

# Development
## Local development

Install dependencies via:

```bash
npm install
```

Then compile the assets and start a server with:

```bash
npm start
```

This will start an auto-reloading webserver at http://localhost:9966

## Local OSRM instance

The most common modifcation is to add your own OSRM endpoint. For this open `src/leaflet_options.js`:

```
  services: [{
    label: 'Car (fastest)',
    path: 'http://myserver.example.com/route/v1'
  }],

```

Replace the path with whatever your endpoint looks like.

# Debug Interface

There is a debug interface for osrm-backend, accessible at http://127.0.0.1:9966/debug .
It shows the edges of the graph, with the speed, and in pink the  "small components",
areas of the road network that are isolated from the rest for some reason
(invalid turn restrictions, barriers, disconnected, incorrect oneways, etc)
and are discarded in the routing machine.

Warning : If you want to debug your own osrm-backend, you have to edit debug/index.html
and change http://router.project-osrm.org/tile/v1/car/tile to your own endpoint.
