# OpenStreetMap vector style assets

Style: https://vector.openstreetmap.org/styles/shortbread/colorful.json
Sprites: https://vector.openstreetmap.org/styles/shortbread/sprites/basics/sprites
Retrieved 2026-11-15. The style retains its original metadata, license link, tile
source and attribution.

The style and sprites are served locally because the upstream styling endpoints
do not provide cross-origin response headers. Vector tiles still come directly
from OpenStreetMap. Noto Sans Regular and Bold glyphs use the CORS-enabled
https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf endpoint; the style's
font stack names are mapped to that service's names. Relative sprite URLs are
resolved against the style file at runtime for subdirectory deployments.

Local adaptations add reference shields for motorways and main roads at overview
zooms. `src/road_shields.js` supplies their stretchable neutral background at
runtime; the original tile source, fonts and attribution are retained.

Selected destinations show names alongside their icons: hospitals start at tile
zoom 14; clinics, pharmacies, fuel stations and lodging start at zoom 15. Other
POI categories retain their existing thresholds. Unnamed destinations keep their
category symbol, and collision handling hides text where space is tight.
`src/poi_icons.js` generates local fuel and lodging distance-field symbols so
their colors adapt to both palettes. `src/vector_images.js` resolves these and
the road plates together before the first tile image response, without another
image service.

Named footpaths, cycleways, steps and paths fade in at tile zoom 15; named service
roads follow at zoom 16. These labels follow the way geometry, use a smaller type
size than ordinary street names, and have lower collision priority. Unnamed ways
retain their existing rendering without additional labels.

At tile zoom 15 and above, access markings follow the selected routing profile:
red short dashes indicate an explicit `no`, amber longer dashes indicate
`limited`. Driving uses `motorcar`, cycling uses `bicycle`, and walking uses
`foot`. Missing flags and unrecognized profiles receive no access markings.
The mode selector shows a localized legend when these markings are visible.
Mode changes update only MapLibre global paint state, preserving the tile cache.
These colors use the background tile metadata and do not alter routing requests.
The old `bicycle=designated` accent layers are removed: this tile source reduces
that value to `yes`, which also covers ordinary permission to cycle.

Shield content bounds leave a one-pixel border inset, with compact text padding.
Shortbread 1.1 road labels expose references and road classes, but no country
code or route-network identifier. National shield styling needs additional
metadata; the current style uses neutral plates. See
https://shortbread-tiles.org/schema/1.1/#layer-street_labels .
