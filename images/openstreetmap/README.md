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

The selected bundled vector map starts downloading its style and the matching
local sprite JSON/PNG alongside the renderer module. MapLibre receives the parsed
style directly, with absolute sprite paths, so it does not request the style a
second time. Custom styles keep their existing loader. This only warms local
rendering assets; MapLibre selects and requests tiles for the visible map.

Official OSM tile requests keep their original URLs and the browser's real
User-Agent, with normal HTTP caching and a `strict-origin-when-cross-origin`
referrer policy. No no-cache headers or per-build tile query parameters are
added. Tile responses use their provider's cache lifetime, as required by the
[OSMF vector usage policy](https://operations.osmfoundation.org/policies/vector/).
The seven-day alternative applies when a provider expiry is not used; the
application does not override an explicit shorter provider lifetime. Browser
cache persistence and eviction remain browser-controlled. Style switching
continues to reuse the live renderer and its loaded tiles. There is no tile
archive, bulk prefetcher or caching proxy in front of the OSM service.

The page, map container and initial vector background are transparent while the
first view loads. Features remain visible as they arrive. Once ready, the vector
background uses its normal palette color. Later tile requests and palette
switches keep the existing map visible.

On mobile and portrait tablets, the directions pane has a draggable grip with
compact, medium and expanded positions. Tapping the grip cycles through
these sizes; keyboard arrows, Home and End also resize it. Resizing keeps the
current route, waypoints and pane visibility. The close button controls visibility.
Desktop and short landscape layouts retain their sidebar.

On mobile, camera targets and zoom buttons use the center of the map area above
the current directions sheet. Dragging, minimizing, opening or closing the sheet
moves the map by the corresponding offset while keeping the same geographic
focus and zoom. Shared URLs store that visible focus, so restoring a view also
works with a different sheet height. Search results and location fixes use the
same centering, including cached location requests.
In short landscape layouts, centering uses the open area beside the sidebar.
Opening and closing the pane use its final dimensions immediately, so automatic
route centering does not compete with a height transition. Grip snapping retains
its resize animation and respects reduced-motion preferences.
Clicking a waypoint input row or a turn-by-turn instruction centers its location
in the same unobstructed area without changing zoom or recomputing the route.
Waypoint rows focus the displayed pin when routing uses a separate entrance.

Water polygons classified as `canal` use the same fill as reservoirs, basins and
docks. Canals classified as ordinary `water` retain their existing appearance.

Covered waterway sections use thin, translucent blue dashes that fade in between
style zooms 14 and 14.5. This keeps culverts and covered passages traceable across
roads and buildings while distinguishing them from open water. Only water lines
explicitly marked `tunnel: true` receive these dashes, with no additional labels.
The Satellite street overlay continues to omit water geometry.

Map labels follow the selected UI language when the tiles provide a `name_xx`
translation. A regional or script-specific name takes priority over the base
language, followed by the local `name`. Empty translations also fall back.
Language changes update name text on the existing renderer; palette switches
preserve that language. Road references and house numbers retain their own
fields. Translations come from the vector tiles, without a translation service.
Live language changes apply once style layers exist, including while new tiles
are loading. Early changes wait for the style and use the latest selection.

Named localities use small mixed-case labels that fade in between style zooms
13 and 13.5, with street, POI and settlement names taking priority. They use the
existing `place_labels` features, follow the selected language and remain
available on the Satellite street overlay without adding settlement symbols.

Named farms and isolated dwellings fade in over the same zoom range, with slightly
larger mixed-case labels than localities. They yield to street, POI and settlement
names, follow the selected language and appear on the Satellite street overlay.
They use existing place features without adding icons or another tile source.

Satellite enables a Street overlay by default, with translucent roads, pedestrian
areas, street and place names, reference shields and exit badges. Other ground
fills and POI layers stay hidden so the imagery remains visible. The checkbox
appears only for Satellite; turning it off is remembered independently of the trail
and component overlays. It shares the OpenStreetMap renderer and tile cache,
including language and access markings. Disabling it keeps that cache alive.

House numbers stored on POIs fade in between style zooms 16.5 and 17, using the same
small type as ordinary addresses. They move around existing icons and give
street names, POI names and icons priority when space is tight. These numbers
also appear on the Satellite street overlay. Shortbread stores these addresses
on the POI instead of repeating the same feature in the `addresses` layer.

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

Campsites and caravan sites use distinct local tent and caravan symbols, with
names fading in alongside the icons between style zooms 14 and 14.4. They use
subtle green accents in both palettes and ordinary collision handling; names
may yield to icons in dense areas. Unnamed sites retain the category symbol.

Courthouses, embassies and diplomatic offices use the bundled civic-building and
flag symbols, with neutral blue-grey names. Icons and names fade in between
style zooms 15 and 15.4. Street and place labels retain priority, and names may
yield to symbols in crowded areas. Features tagged as both an embassy and a
diplomatic office get one civic symbol rather than two overlapping icons.

Castles and forts show compact names beside the bundled castle symbol, fading
in between style zooms 15 and 15.4. Names follow the selected language and yield
to symbols, street names and settlement names when space is tight. Other historic
features keep their existing icon-only treatment. These landmark POIs remain
hidden on the Satellite street overlay.

Viewpoints show small names beside the bundled viewpoint symbol, fading in
between style zooms 14 and 14.4 with green accents in both palettes. Names follow
the selected language and yield to symbols, street names and settlement names
when space is tight. Unnamed viewpoints retain their symbol. Observation towers
also tagged as viewpoints use one viewpoint symbol, and ordinary towers keep
their existing treatment. These POIs remain hidden on the Satellite street
overlay.

Destinations classified as `tourism=zoo` show compact names beside the bundled
zoo symbol. They fade in between style zooms 15 and 15.4 with the same green
accents as viewpoints. Names follow the selected language and yield to street
and settlement names, and unnamed sites retain their symbol. These POIs remain
hidden on the Satellite street overlay.

Alpine huts classified as `tourism=alpine_hut` use the bundled chalet symbol and
compact green names, fading in between style zooms 14 and 14.4. Names follow the
selected language, with street and settlement labels taking priority. Unnamed
huts retain their symbol; the style does not infer opening hours or current
availability. Day shelters and holiday chalets keep their existing treatment.
These POIs remain hidden on the Satellite street overlay.

Named parks classified as `leisure=park` use compact green labels in both vector
palettes, fading in between style zooms 14 and 14.5. Names use the selected
language when available and yield to street and settlement labels. Parks use
their area fill and name in place of the generic sports icon. Park labels are
hidden on the Satellite street overlay.

Named footpaths, cycleways, steps and paths fade in at tile zoom 15; named service
roads follow at zoom 16. These labels follow the way geometry, use a smaller type
size than ordinary street names, and have lower collision priority. Unnamed ways
retain their existing rendering without additional labels.

Named pedestrian areas, including squares and station forecourts, receive small
point labels from tile zoom 15. They fade in over half a zoom level, allow normal
collision handling, and give existing street and place names priority. These
labels use the tile source's dedicated `streets_polygons_labels` points.

Sports-centre footprints fade in between tile zooms 13 and 14 with a translucent
green tint. This marks the facility boundary without assuming every surface is
grass. Water, parking areas, buildings and roads draw above the tint. The dark
palette uses its existing park green, and both palettes share the same tiles.

At tile zoom 15 and above, access markings follow the selected routing profile:
red short dashes indicate an explicit `no`, amber longer dashes indicate
`limited`. Driving uses `motorcar`, cycling uses `bicycle`, and walking uses
`foot`. Missing flags and unrecognized profiles receive no access markings.
The mode selector shows a localized legend when these markings are visible.
Mode changes update only MapLibre global paint state, preserving the tile cache.
These colors use the background tile metadata and do not alter routing requests.
The old `bicycle=designated` accent layers are removed: this tile source reduces
that value to `yes`, which also covers ordinary permission to cycle.

Transport details include bus stations and ferry terminals from tile zoom 13,
aerialway stations from zoom 14, and helipads from zoom 15. Names can give way to
icons in dense areas. Local distance-field symbols cover ferries, helipads and
cable cars. Aerialway lines appear from zoom 13. Narrow-gauge and subway service
tracks use the rail and light-rail service rules, with the main-track styling
preserved, including separate bridge and tunnel treatment.
All of these features use the existing vector tiles and shared image resolver.

Shield content bounds leave a one-pixel border inset, with compact text padding.
Shortbread 1.1 road labels expose references and road classes, but no country
code or route-network identifier. National shield styling needs additional
metadata; the current style uses neutral plates. See
https://shortbread-tiles.org/schema/1.1/#layer-street_labels .
