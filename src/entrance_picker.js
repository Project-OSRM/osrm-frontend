'use strict';

var L = require('leaflet');

// Which OSM `entrance=*` values can serve as a routing endpoint, and in which
// direction. Two of them are one-way, per the wiki's own definitions:
//
//   entrance=exit      "it is a one-way out of a building or enclosed area"
//   entrance=entrance  "it is an entrance only, a one-way in"
//
// so an exit is a legitimate place to *start* a route and a useless place to end
// one, and vice versa. `staircase` — "Door to staircase" — belongs with `home`
// rather than with the interior doors: it is the door of a stairwell, which is
// how residents and visitors of an apartment building get in, and it is the
// third most common value on entrance nodes after `yes` and `main`. Values
// absent from this table are never offered: `service` (staff and deliveries),
// `emergency` (fire escape), `garage` (an interior door), and `no` — which the
// wiki defines as looking like a door but not being usable at all.
var ENTRANCE_USE = {
  main:      {enter: true, leave: true},
  yes:       {enter: true, leave: true},
  secondary: {enter: true, leave: true},
  shop:      {enter: true, leave: true},
  home:      {enter: true, leave: true},
  staircase: {enter: true, leave: true},
  entrance:  {enter: true, leave: false},
  exit:      {enter: false, leave: true}
};

// The area has to fill at least this share of the free viewport to count as
// framed. Below it the site reads as a blob somewhere on the map rather than as
// the place the user is choosing a door into.
var MIN_EXTENT_FILL = 0.35;

var MAX_PICKER_ZOOM = 18;

// Ties the chosen door back to the pin that stayed on the place. Dashed
// throughout, and thinner than the route, so it never reads as something you can
// travel along.
var ENTRANCE_LINK_STYLE = {
  color: '#2b7ac9',
  weight: 3,
  opacity: 0.9,
  dashArray: '3,7',
  lineCap: 'round',
  interactive: false
};

// Breathing room between the framed area and the edges of the free viewport.
var FIT_PADDING = 24;

// Two entrance dots closer together than this on screen cannot be aimed at
// separately. The dots are 18 px across, so this leaves a clear gap between them.
var MIN_DOT_SEPARATION_PX = 32;

// Long enough to outlast Leaflet's default 250 ms pan/zoom animation.
var SETTLE_TIMEOUT_MS = 450;

// Labels live in their own pane, kept just below Leaflet's marker pane (600).
// A zIndexOffset cannot do this job: Leaflet derives a marker's z-index from its
// latitude, so a label on a northerly door still outranks a dot on a southerly
// one however the offsets are set. A pane settles it for every marker at once.
var LABEL_PANE = 'osrmEntranceLabels';
var LABEL_PANE_Z_INDEX = 590;

// The site the entrances belong to. Muted and non-interactive: it is context for
// the dots, not a thing to click, and it must never obscure the route line.
var OUTLINE_STYLE = {
  color: '#2b7ac9',
  weight: 2,
  opacity: 0.7,
  dashArray: '6 4',
  fill: true,
  fillColor: '#2b7ac9',
  fillOpacity: 0.07,
  interactive: false
};

// The OSM access keys that govern each routing mode, most specific first. The
// general `access` key is the fallback for all of them, and `vehicle` covers
// both wheeled modes. This is the ordering OSM's access documentation
// prescribes: the most specific tag present wins.
var MODE_ACCESS_KEYS = {
  foot: ['foot', 'access'],
  bike: ['bicycle', 'vehicle', 'access'],
  bicycle: ['bicycle', 'vehicle', 'access'],
  driving: ['motor_vehicle', 'vehicle', 'access'],
  car: ['motor_vehicle', 'vehicle', 'access']
};

// Values that put a door out of bounds. Everything else — `yes`, `permissive`,
// `designated`, `destination`, `customers`, `permit` — is treated as usable:
// somebody routing to a shop's door is the customer it is tagged for. An
// unrecognised value is not read as a prohibition.
var FORBIDDEN_ACCESS = {no: true, private: true};

/**
 * Whether a door's own tags permit the given travel mode. A door with nothing
 * to say on the subject is allowed: absence of a tag is not a prohibition.
 *
 * @param {object} entrance — with an optional `tags` map from OSM
 * @param {string} [mode] — 'foot', 'bike'/'bicycle', or 'driving'/'car'
 */
function allowsMode(entrance, mode) {
  if (!mode) return true;
  var keys = MODE_ACCESS_KEYS[mode];
  if (!keys) return true;
  var tags = entrance && entrance.tags;
  if (!tags) return true;
  for (var i = 0; i < keys.length; i++) {
    var value = tags[keys[i]];
    // The most specific tag present settles it; a broader one cannot override.
    if (typeof value === 'string') return !FORBIDDEN_ACCESS[value.toLowerCase()];
  }
  return true;
}

/**
 * The entrances usable at one end of a route, for one travel mode.
 *
 * @param {Array} entrances
 * @param {string} [role] — 'origin' (the traveller leaves the building here),
 *   'destination' (arrives), or 'via' (both, and so the strictest). Defaults to
 *   'via', which offers only doors that work in either direction.
 * @param {string} [mode] — the routing profile. Omitted, no access filtering is
 *   applied.
 */
function routableEntrances(entrances, role, mode) {
  if (!Array.isArray(entrances)) return [];
  // A via point is both arrived at and left from, so it needs both directions.
  var needsEnter = role !== 'origin';
  var needsLeave = role !== 'destination';
  return entrances.filter(function(entrance) {
    if (!entrance || !entrance.center) return false;
    var use = ENTRANCE_USE[entrance.type];
    if (!use) return false;
    if (!((!needsEnter || use.enter) && (!needsLeave || use.leave))) return false;
    return allowsMode(entrance, mode);
  });
}

/**
 * The name a door carries in OSM, if any. Most entrances have none — which is
 * why the picker is a map rather than a list — but the ones that do are named
 * exactly as the signage reads ("Haupteingang Alexanderplatz", "Eingang
 * Ravelinplatz"), and that beats any label this app could invent. `ref` is the
 * fallback for doors numbered rather than named.
 *
 * @param {object} entrance
 * @returns {string|null}
 */
function entranceName(entrance) {
  var tags = entrance && entrance.tags;
  if (!tags) return null;
  var name = tags.name || tags.ref;
  if (typeof name !== 'string') return null;
  name = name.trim();
  return name.length ? name : null;
}

// OSM's wheelchair values that mean a door can actually be used. `designated`
// marks one provided specifically for wheelchair users, so it qualifies at
// least as much as `yes`. `limited` deliberately does not: it means passable
// only with help, or under conditions the tag does not spell out, and a mark
// promising step-free access there would be worse than no mark at all.
var WHEELCHAIR_ACCESSIBLE = {yes: true, designated: true};

// What is worth pointing out about a door depends entirely on how the traveller
// is arriving, so each mark belongs to one travel mode and appears in no other.
// Step-free access matters to someone on foot and says nothing to a driver;
// which door swallows cars matters to a driver and is noise to everyone else.
//
// There is deliberately no mark for cycling. Its natural candidate, `bicycle`
// on an entrance node, does not reach even 0.05% of them globally — far below
// `wheelchair` at 4.7% — so a cycling mark would be an icon nobody ever sees.
var MARKS = {
  wheelchair: {
    className: 'osrm-entrance-mark-wheelchair',
    // U+267F. Written as a surrogate pair rather than an escape this file's
    // ES5 syntax cannot express.
    glyph: '\u267F',
    label: 'Wheelchair accessible',
    applies: function(tags) {
      var value = tags.wheelchair;
      if (typeof value !== 'string') return false;
      return WHEELCHAIR_ACCESSIBLE[value.trim().toLowerCase()] === true;
    }
  },
  parking: {
    className: 'osrm-entrance-mark-parking',
    // U+1F17F, negative squared latin capital letter P.
    glyph: '\uD83C\uDD7F',
    label: 'Parking entrance',
    applies: function(tags) {
      return tags.amenity === 'parking_entrance';
    }
  }
};

// Keyed by the same profile names as MODE_ACCESS_KEYS, so both tables agree on
// what a mode is called.
var MODE_MARK = {
  foot: 'wheelchair',
  driving: 'parking',
  car: 'parking'
};

/**
 * The mark a door earns for one travel mode, or null.
 *
 * A mark never filters. Roughly seven in eight entrance nodes carry no
 * wheelchair tag and far fewer carry parking tags, so an absent value means
 * nobody surveyed the door rather than that the door lacks the property, and
 * `routableEntrances` stays untouched by any of this.
 *
 * @param {object} entrance
 * @param {string} [mode] — the routing profile. A mode with no mark of its own,
 *   or none at all, marks nothing.
 * @returns {?{className: string, glyph: string, label: string}}
 */
function entranceMark(entrance, mode) {
  var mark = MARKS[MODE_MARK[mode]];
  var tags = entrance && entrance.tags;
  if (!mark || !tags) return null;
  return mark.applies(tags) ? mark : null;
}

// Two label boxes touching edge-to-edge are not overlapping; only real overlap
// counts, so labels may sit flush against each other.
function boxesOverlap(a, b) {
  return !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
}

/**
 * Groups labels that cannot all be shown at once.
 *
 * Overlap is transitive here: if A overlaps B and B overlaps C then all three
 * become one group, even where A and C are clear of each other. Showing A and C
 * but not B would be arbitrary, and the whole run has to collapse into one label
 * for the result to be readable.
 *
 * @param {Array<{left: number, right: number, top: number, bottom: number}>} boxes
 * @returns {Array<Array<number>>} indices, grouped; singletons are groups of one
 */
function clusterOverlappingLabels(boxes) {
  if (!Array.isArray(boxes) || boxes.length === 0) return [];
  // Union-find over the boxes.
  var parent = boxes.map(function(_, i) {
    return i;
  });
  function find(i) {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  }
  function union(a, b) {
    var ra = find(a);
    var rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  }
  for (var i = 0; i < boxes.length - 1; i++) {
    for (var j = i + 1; j < boxes.length; j++) {
      if (boxes[i] && boxes[j] && boxesOverlap(boxes[i], boxes[j])) union(i, j);
    }
  }
  // Preserve the original order, both of the groups and within them.
  var groups = [];
  var indexOfRoot = {};
  boxes.forEach(function(_, k) {
    var root = find(k);
    if (indexOfRoot[root] === undefined) {
      indexOfRoot[root] = groups.length;
      groups.push([]);
    }
    groups[indexOfRoot[root]].push(k);
  });
  return groups;
}

// Where a waypoint sits in the route, which is what decides the direction a door
// has to work in.
function waypointRole(index, count) {
  if (index === 0) return 'origin';
  if (index === count - 1) return 'destination';
  return 'via';
}

// The doors the picker offers. The place centre is not among them: the
// waypoint's own pin never leaves it, so it is already marked on the map, and
// clicking the selected door again is what routes back to it.
//
// The entrances are expected to have been through routableEntrances already;
// filtering again here would apply the default role and quietly drop the
// one-way doors the caller deliberately allowed.
function buildChoices(placeCenter, entrances) {
  return (Array.isArray(entrances) ? entrances : []).filter(function(e) {
    return !!(e && e.center);
  }).map(function(entrance) {
    return {
      id: 'osm:' + entrance.osmId,
      kind: entrance.type === 'main' ? 'main' : 'other',
      center: entrance.center,
      entrance: entrance
    };
  });
}

// Zooming is worth the disruption unless the area already sits clear of the pane
// and fills enough of the free viewport to be legible. Both are measured in
// container pixels.
function shouldZoomToExtent(extent, viewport, clear) {
  if (!clear) return true;
  if (!viewport || viewport.width <= 0 || viewport.height <= 0) return true;
  var fill = Math.max(extent.width / viewport.width, extent.height / viewport.height);
  return fill < MIN_EXTENT_FILL;
}

// Whether an extent, already projected to container pixels, sits inside the part
// of the map the directions pane does not cover. Anything under the pane is as
// good as off screen.
function isExtentClear(sw, ne, mapSize, paneWidth) {
  var usableWidth = mapSize.x - (paneWidth || 0);
  return Math.min(sw.x, ne.x) >= 0 && Math.max(sw.x, ne.x) <= usableWidth &&
    Math.min(sw.y, ne.y) >= 0 && Math.max(sw.y, ne.y) <= mapSize.y;
}

// The points to frame when the place has no bounding box of its own — a node,
// or an endpoint that did not return one. The centre is included because the
// waypoint's pin sits there and has to stay in view alongside the doors.
function choicePoints(choices, placeCenter) {
  var points = choices.map(function(choice) {
    return choice.center;
  });
  if (placeCenter) points.push(placeCenter);
  return points;
}

// The door positions, which is all the choices now are.
function entranceCenters(choices) {
  return choices.map(function(choice) {
    return choice.center;
  });
}

// Smallest gap between any two of the projected dots, in pixels. This is what
// decides whether a framing leaves the entrances separately clickable.
function minPairSeparation(points) {
  if (!points || points.length < 2) return Infinity;
  var min = Infinity;
  for (var i = 0; i < points.length - 1; i++) {
    for (var j = i + 1; j < points.length; j++) {
      var dx = points[i].x - points[j].x;
      var dy = points[i].y - points[j].y;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d < min) min = d;
    }
  }
  return min;
}

/**
 * Map-based picker for the entrance nodes Nominatim returns alongside a place.
 *
 * A geocoded place drops its waypoint on the centroid, which for large sites
 * (airports, campuses, parks) is nowhere a vehicle can reach. This surfaces the
 * alternatives as small clickable dots on the map rather than as list rows:
 * Nominatim gives entrances no name or ref, only a type and coordinates, so
 * position on the map is the only thing that distinguishes one from another.
 *
 * The picker never chooses for the user. `entrance=main` records how a building
 * is laid out, not which door a route can reach — the Pergamonmuseum tags a main
 * door that the walking network stops 90 m short of — so acting on the tag would
 * confidently place the waypoint somewhere unreachable. Every entrance is
 * offered and the waypoint stays on the centre until a dot is clicked.
 *
 * @param {L.Map} map
 * @param {object} options
 * @param {function} options.onSelect  — called with {waypointIndex, placeName, latLng, entrance}
 * @param {function} [options.translate] — (key) => localized string
 * @param {function} [options.fetchOutline] — (place) => Promise<GeoJSON geometry|null>
 * @param {function} [options.paneWidth] — () => width in px of the directions pane
 * @returns {{show: function, hide: function, isOpen: function, getActiveId: function}}
 */
function createEntrancePicker(map, options) {
  options = options || {};
  var translate = typeof options.translate === 'function' ? options.translate : function(key) {
    return key;
  };
  var onSelect = typeof options.onSelect === 'function' ? options.onSelect : function() {};
  var fetchOutline = typeof options.fetchOutline === 'function' ? options.fetchOutline : null;
  // Read live rather than captured once: the directions pane is still hidden
  // when the picker opens and slides in when the route arrives.
  var paneWidth = typeof options.paneWidth === 'function' ? options.paneWidth : function() {
    return 0;
  };
  // Two groups so redrawing the dots on every selection does not discard an
  // outline that took a network round-trip to get. Markers sit in Leaflet's
  // marker pane and paths in the overlay pane, so the dots stay on top.
  var outlineLayer = L.layerGroup();
  // The dashed link from the chosen door back to the pin, which never moves.
  var linkLayer = L.layerGroup();
  // Labels are markers of our own rather than Leaflet tooltips, for two
  // reasons. The tooltip pane sits above the marker pane, so a label would be
  // drawn over the very dot it names; as markers they share a pane with the
  // dots, and a lower zIndexOffset puts every dot on top. And rebinding a
  // permanent tooltip to re-measure it leaves the old element orphaned in the
  // pane, whereas clearing a layer group really does remove what is in it.
  var labelLayer = L.layerGroup();
  var markerLayer = L.layerGroup();
  var layer = L.layerGroup([outlineLayer, linkLayer, labelLayer, markerLayer]);
  var state = null;
  // Guards against a slow outline arriving after the user has moved on.
  var outlineToken = 0;

  function label(choice) {
    // A door that names itself needs no description from us.
    var named = entranceName(choice.entrance);
    if (named) return named;
    var type = choice.entrance && choice.entrance.type;
    // An exit is only ever offered at an origin, and calling it an entrance
    // there would contradict the reason it is on offer.
    if (type === 'exit') return translate('Exit');
    if (choice.kind === 'main') return translate('Main entrance');
    return translate('Entrance');
  }

  function onKeyDown(e) {
    if (e && (e.key === 'Escape' || e.keyCode === 27)) hide();
  }

  // Every door stays on the map for as long as the picker is open, chosen or
  // not, so the alternatives are always one click away. The chosen one is marked
  // rather than removed.
  function render() {
    markerLayer.clearLayers();
    linkLayer.clearLayers();
    if (!state) return;
    var drawn = [];

    state.choices.forEach(function(choice) {
      var text = label(choice);
      var mark = entranceMark(choice.entrance, state.mode);
      var chosen = choice.id === state.selectedId;
      var className = 'osrm-entrance-marker osrm-entrance-marker-' + choice.kind +
        (chosen ? ' osrm-entrance-marker-selected' : '');
      var marker = L.marker(choice.center, {
        icon: L.divIcon({className: className, iconSize: [18, 18], iconAnchor: [9, 9], html: ''}),
        // The label shows this as an icon; the alt spells it out, because the
        // icon is marked aria-hidden and would otherwise be announced as
        // nothing at all.
        alt: mark ? text + ' (' + translate(mark.label) + ')' : text,
        keyboard: true,
        zIndexOffset: chosen ? 500 : 400
      });
      // The name travels with the dot; layoutLabels turns it into a label the
      // user can read without hovering.
      marker.__entranceLabel = text;
      marker.__entranceMark = mark;
      marker.on('click', function(e) {
        // Without this the click also lands on the map, which would drop a new
        // waypoint on top of the place being chosen for.
        L.DomEvent.stopPropagation(e);
        select(choice);
      });
      markerLayer.addLayer(marker);
      drawn.push(marker);

      // The pin stays on the place, so the chosen door is tied back to it with a
      // dashed line: the route runs to the door, and this is the last bit on
      // foot that no router can describe.
      if (chosen && state.placeCenter) {
        linkLayer.addLayer(L.polyline([choice.center, state.placeCenter], ENTRANCE_LINK_STYLE));
      }
    });

    state.markers = drawn;
    layoutLabels();
  }

  // Clicking the chosen door again releases it, which is how the route goes back
  // to the place itself. There is no separate dot for that: the pin is already
  // sitting on it.
  function select(choice) {
    if (!state) return;
    var release = choice.id === state.selectedId;
    state.selectedId = release ? null : choice.id;
    render();
    onSelect({
      waypointIndex: state.waypointIndex,
      placeName: state.placeName,
      // Where the route should run to; the pin does not follow it.
      latLng: release ? state.placeCenter : choice.center,
      markerLatLng: state.placeCenter,
      entrance: release ? null : choice.entrance
    });
  }

  // Created lazily, because the picker may be built before the map has panes.
  function ensureLabelPane() {
    if (typeof map.createPane !== 'function' || typeof map.getPane !== 'function') return null;
    var pane = map.getPane(LABEL_PANE);
    if (!pane) {
      pane = map.createPane(LABEL_PANE);
      if (pane && pane.style) pane.style.zIndex = LABEL_PANE_Z_INDEX;
    }
    return LABEL_PANE;
  }

  // A label sits above the door it names, anchored on it. Zero-sized so the
  // anchor is the door itself; the inner element does the drawing and is what
  // gets measured.
  function labelEntry(marker) {
    return {text: marker.__entranceLabel, mark: marker.__entranceMark || null};
  }

  function addLabel(latLng, entries, merged) {
    var options = {
      icon: L.divIcon({
        className: 'osrm-entrance-label' + (merged ? ' osrm-entrance-label-merged' : ''),
        iconSize: null,
        html: '<span class="osrm-entrance-label-inner">' +
          entries.map(labelLine).join('') + '</span>'
      }),
      // Never in the way of a click on a door, and always drawn beneath one.
      interactive: false,
      zIndexOffset: 100
    };
    var pane = ensureLabelPane();
    if (pane) options.pane = pane;
    var marker = L.marker(latLng, options);
    labelLayer.addLayer(marker);
    return marker;
  }

  // These names come from OSM and would otherwise be read as markup.
  function labelLine(entry) {
    var div = document.createElement('div');
    div.textContent = entry.text;
    // Hidden from assistive tech on purpose: the dot's alt already says what the
    // mark means in words, and announcing the symbol too would repeat it.
    var mark = entry.mark
      ? '<span class="osrm-entrance-mark ' + entry.mark.className +
        '" aria-hidden="true">' + entry.mark.glyph + '</span>'
      : '';
    return '<div>' + div.innerHTML + mark + '</div>';
  }

  function labelBox(marker) {
    var el = marker.getElement && marker.getElement();
    var inner = el && el.querySelector && el.querySelector('.osrm-entrance-label-inner');
    if (!inner || !inner.getBoundingClientRect) return null;
    var r = inner.getBoundingClientRect();
    return {left: r.left, right: r.right, top: r.top, bottom: r.bottom};
  }

  function markerLatLng(marker) {
    return marker.getLatLng ? marker.getLatLng() : marker.latLng;
  }

  // Names are only worth showing permanently while they can be read. Where the
  // boxes collide — which is a question of zoom, not of the data — the whole
  // colliding run is replaced by one label listing every door in it, anchored on
  // the first. Zooming in separates them and they come back individually.
  function layoutLabels() {
    if (!state || !state.markers) return null;
    var markers = state.markers;

    // One label per door first, because their boxes are what the grouping is
    // decided from.
    labelLayer.clearLayers();
    var labels = markers.map(function(marker) {
      return addLabel(markerLatLng(marker), [labelEntry(marker)], false);
    });

    var boxes = labels.map(labelBox);
    if (boxes.some(function(b) {
      return !b;
    })) return null;

    var groups = clusterOverlappingLabels(boxes);
    if (groups.every(function(g) {
      return g.length === 1;
    })) return groups;

    // At least one run collides, so the whole set is laid out again with those
    // runs collapsed onto their first door.
    labelLayer.clearLayers();
    groups.forEach(function(group) {
      addLabel(markerLatLng(markers[group[0]]),
        group.map(function(i) {
          return labelEntry(markers[i]);
        }),
        group.length > 1);
    });
    return groups;
  }

  // What to frame. The place's own bounding box is preferred — it shows the site
  // the doors belong to — but only while that framing leaves the doors far
  // enough apart to aim at. BER's five entrances sit ~36 m apart on a 5 km site,
  // which is about 3 px at the zoom its bbox implies, so there the entrances win
  // and the site outline simply runs off the edges.
  function framingBounds(padRight) {
    var area = state.placeBounds;
    var doors = entranceCenters(state.choices);

    if (!area || !area.isValid()) {
      // The pin stays on the centre, so it belongs in the frame alongside the
      // doors unless the doors alone already span enough to aim at.
      var points = doors.length > 1 ? doors : choicePoints(state.choices, state.placeCenter);
      return points.length > 1 ? L.latLngBounds(points) : null;
    }
    if (doors.length < 2) return area;

    // The zoom fitting the area would settle on, and the dots as they would land
    // at it.
    var areaZoom = map.getBoundsZoom(area, false,
      L.point(padRight + 2 * FIT_PADDING, 2 * FIT_PADDING));
    var projected = doors.map(function(latLng) {
      return map.project(latLng, areaZoom);
    });
    if (minPairSeparation(projected) >= MIN_DOT_SEPARATION_PX) return area;
    return L.latLngBounds(doors);
  }

  // Frames whatever framingBounds picked into the part of the map the directions
  // pane does not cover, rather than merely centring it, so the pane never sits
  // over the thing being picked from.
  function focusView() {
    if (!state) return false;
    var padRight = paneWidth();
    var bounds = framingBounds(padRight);
    if (!bounds || !bounds.isValid()) return false;

    var sw = map.latLngToContainerPoint(bounds.getSouthWest());
    var ne = map.latLngToContainerPoint(bounds.getNorthEast());
    var mapSize = map.getSize();
    var extent = {width: Math.abs(ne.x - sw.x), height: Math.abs(sw.y - ne.y)};
    var viewport = {
      width: mapSize.x - padRight - 2 * FIT_PADDING,
      height: mapSize.y - 2 * FIT_PADDING
    };
    var clear = isExtentClear(sw, ne, mapSize, padRight);
    if (!shouldZoomToExtent(extent, viewport, clear)) return false;

    map.fitBounds(bounds, {
      maxZoom: MAX_PICKER_ZOOM,
      paddingTopLeft: L.point(FIT_PADDING, FIT_PADDING),
      paddingBottomRight: L.point(padRight + FIT_PADDING, FIT_PADDING)
    });
    return true;
  }

  // A route fit is an animated move, and a fitBounds issued on top of one is
  // either ignored outright or undone when that animation ends. Wait for the map
  // to settle before re-framing, with a timer as the backstop for the case where
  // nothing moved and no moveend ever arrives.
  function focusViewWhenSettled() {
    if (!state) return;
    var timer = null;
    function run() {
      map.off('moveend', run);
      if (timer) clearTimeout(timer);
      timer = null;
      focusView();
    }
    timer = setTimeout(run, SETTLE_TIMEOUT_MS);
    map.on('moveend', run);
  }

  // The outline is best-effort context: a failed or absent one simply means the
  // picker shows dots without a site boundary.
  function loadOutline(place) {
    var token = ++outlineToken;
    outlineLayer.clearLayers();
    if (!fetchOutline || !place) return;
    fetchOutline(place).then(function(geometry) {
      if (token !== outlineToken || !state || !geometry) return;
      outlineLayer.addLayer(L.geoJSON(geometry, {style: OUTLINE_STYLE}));
    });
  }

  function show(opts) {
    var choices = buildChoices(opts.placeCenter, opts.entrances);
    // One door is still worth offering now that the centre is not a dot: the
    // pin marks it already.
    if (choices.length < 1) {
      hide();
      return false;
    }
    state = {
      waypointIndex: opts.waypointIndex,
      placeName: opts.placeName,
      placeCenter: opts.placeCenter || null,
      choices: choices,
      // Which mark a door earns depends on it, and refresh() re-shows the
      // picker with a new one whenever the travel mode changes.
      mode: opts.mode || null,
      selectedId: opts.selectedId || null,
      placeBounds: opts.placeBounds || null
    };
    if (!map.hasLayer(layer)) layer.addTo(map);
    loadOutline(opts.place);
    focusViewWhenSettled();
    render();
    // Which labels fit is a question of zoom, so the layout is redone after
    // every one.
    //
    // Detached first because show() runs again on an already-open picker when
    // the travel mode changes. Leaflet and the DOM both ignore a repeat
    // registration of the same handler, but relying on that makes correctness
    // here depend on someone else's de-duplication; removing first makes it
    // ours.
    map.off('zoomend', layoutLabels);
    map.on('zoomend', layoutLabels);
    if (typeof document !== 'undefined') {
      document.removeEventListener('keydown', onKeyDown);
      document.addEventListener('keydown', onKeyDown);
    }
    return true;
  }

  function hide() {
    if (!state) return;
    state = null;
    map.off('zoomend', layoutLabels);
    outlineToken++;
    outlineLayer.clearLayers();
    linkLayer.clearLayers();
    labelLayer.clearLayers();
    markerLayer.clearLayers();
    if (map.hasLayer(layer)) map.removeLayer(layer);
    if (typeof document !== 'undefined') {
      document.removeEventListener('keydown', onKeyDown);
    }
  }

  return {
    show: show,
    hide: hide,
    focusView: focusViewWhenSettled,
    layoutLabels: layoutLabels,
    isOpen: function() {
      return !!state;
    },
    getWaypointIndex: function() {
      return state ? state.waypointIndex : null;
    },
    getSelectedId: function() {
      return state ? state.selectedId : null;
    }
  };
}

module.exports = {
  routableEntrances: routableEntrances,
  allowsMode: allowsMode,
  entranceName: entranceName,
  entranceMark: entranceMark,
  boxesOverlap: boxesOverlap,
  clusterOverlappingLabels: clusterOverlappingLabels,
  waypointRole: waypointRole,
  buildChoices: buildChoices,
  shouldZoomToExtent: shouldZoomToExtent,
  isExtentClear: isExtentClear,
  choicePoints: choicePoints,
  entranceCenters: entranceCenters,
  minPairSeparation: minPairSeparation,
  MIN_DOT_SEPARATION_PX: MIN_DOT_SEPARATION_PX,
  createEntrancePicker: createEntrancePicker,
  MIN_EXTENT_FILL: MIN_EXTENT_FILL
};
