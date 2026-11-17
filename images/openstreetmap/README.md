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
