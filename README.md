This is the frontend served at https://map.project-osrm.org.

This frontend is builds heavily ontop of [Leaflet Routing Machine](https://github.com/perliedman/leaflet-routing-machine). If you need a simple OSRM integration in your webpage, you should start from there.

# Building

Run this in the root folder:

```bash
npm install
make
```

To view the frontend in a browser, try `python -m SimpleHTTPServer` and open your browser at `http://127.0.0.1:8000`.

# Modifing

The most common modifcation is to add your own OSRM endpoint. For this open `src/leaflet_options.js`:

```
  services: [{
    label: 'Car (fastest)',
    path: 'http://api-osrm-routed-patrick-develop.tilestream.net/viaroute'
  }],

```

Replace the path with whatever your endpoint looks like.

After this run `make` again.
