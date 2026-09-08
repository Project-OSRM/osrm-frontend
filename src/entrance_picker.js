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

var MAX_PICKER_ZOOM = 18;

// Breathing room between the framed doors and the edges of the viewport.
var FIT_PADDING = 24;

// Long enough to outlast Leaflet's default 250 ms pan/zoom animation.
var SETTLE_TIMEOUT_MS = 450;

// Labels live in their own pane, kept just below Leaflet's marker pane (600).
// A zIndexOffset cannot do this job: Leaflet derives a marker's z-index from its
// latitude, so a label on a northerly door still outranks a dot on a southerly
// one however the offsets are set. A pane settles it for every marker at once.
var LABEL_PANE = 'osrmEntranceLabels';
var LABEL_PANE_Z_INDEX = 590;

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

/**
 * The entrances usable at one end of a route.
 *
 * @param {Array} entrances
 * @param {string} [role] — 'origin' (the traveller leaves the building here),
 *   'destination' (arrives), or 'via' (both, and so the strictest). Defaults to
 *   'via', which offers only doors that work in either direction.
 */
function routableEntrances(entrances, role) {
  if (!Array.isArray(entrances)) return [];
  // A via point is both arrived at and left from, so it needs both directions.
  var needsEnter = role !== 'origin';
  var needsLeave = role !== 'destination';
  return entrances.filter(function(entrance) {
    if (!entrance || !entrance.center) return false;
    var use = ENTRANCE_USE[entrance.type];
    if (!use) return false;
    return (!needsEnter || use.enter) && (!needsLeave || use.leave);
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

// What to frame: the doors, and the place centre with them, because the
// waypoint's pin sits there and has to stay in view alongside them.
function choicePoints(choices, placeCenter) {
  var points = choices.map(function(choice) {
    return choice.center;
  });
  if (placeCenter) points.push(placeCenter);
  return points;
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
 * @param {function} options.onSelect — called with {waypointIndex, placeName,
 *   latLng, markerLatLng, entrance}
 * @param {function} [options.paneWidth] — () => width in px of the directions
 *   pane, so the doors are framed into the part of the map it does not cover
 * @returns {{show: function, hide: function, focusView: function,
 *   isOpen: function, getWaypointIndex: function, getSelectedId: function}}
 */
function createEntrancePicker(map, options) {
  options = options || {};
  var onSelect = typeof options.onSelect === 'function' ? options.onSelect : function() {};
  var translate = typeof options.translate === 'function' ? options.translate : function(key) {
    return key;
  };
  // Read live rather than captured once: the directions pane is still hidden
  // when the picker opens and slides in when the route arrives.
  var paneWidth = typeof options.paneWidth === 'function' ? options.paneWidth : function() {
    return 0;
  };
  // Three groups, so each can be cleared without disturbing the others. Markers
  // sit in Leaflet's marker pane and paths in the overlay pane, so the dots stay
  // above the dashed link whatever the draw order.
  //
  // The dashed link runs from the chosen door back to the pin, which never
  // moves.
  var linkLayer = L.layerGroup();
  // Labels are markers of our own rather than Leaflet tooltips, for two
  // reasons. The tooltip pane sits above the marker pane, so a label would be
  // drawn over the very dot it names; as markers they share a pane with the
  // dots, and a lower zIndexOffset puts every dot on top. And rebinding a
  // permanent tooltip to re-measure it leaves the old element orphaned in the
  // pane, whereas clearing a layer group really does remove what is in it.
  var labelLayer = L.layerGroup();
  var markerLayer = L.layerGroup();
  var layer = L.layerGroup([linkLayer, labelLayer, markerLayer]);
  var offer = null;
  // What each dot currently drawn needs a label to say, in draw order: where it
  // is, what it is called, whether it is the chosen one, and what clicking it
  // does. Kept beside the markers rather than on them — Leaflet's marker is not
  // ours to hang fields off — and label layout groups purely by overlap, so
  // this is all it needs.
  var renderedDoors = [];
  // Whether the layer and the document listener are in place. Tracked rather
  // than inferred from `offer`, because that is cleared before the teardown
  // runs.
  var attached = false;

  // What a dot is called. A door that names itself in OSM says it better than
  // this app could; the rest are described by what they are.
  function label(choice) {
    var named = entranceName(choice.entrance);
    if (named) return named;
    // An exit is only ever offered at an origin, and calling it an entrance
    // there would contradict the reason it is on offer.
    if (choice.entrance && choice.entrance.type === 'exit') return translate('Exit');
    if (choice.kind === 'main') return translate('Main entrance');
    return translate('Entrance');
  }

  function onKeyDown(e) {
    if (e && e.key === 'Escape') hide();
  }

  // Every door stays on the map for as long as the picker is open, chosen or
  // not, so the alternatives are always one click away. The chosen one is marked
  // rather than removed.
  function render() {
    markerLayer.clearLayers();
    linkLayer.clearLayers();
    renderedDoors = [];
    if (!offer) {
      labelLayer.clearLayers();
      return;
    }

    offer.choices.forEach(function(choice) {
      var chosen = choice.id === offer.selectedId;
      var text = label(choice);
      var className = 'osrm-entrance-marker osrm-entrance-marker-' + choice.kind +
        (chosen ? ' osrm-entrance-marker-selected' : '');
      var marker = L.marker(choice.center, {
        icon: L.divIcon({className: className, iconSize: [18, 18], iconAnchor: [9, 9], html: ''}),
        alt: text,
        keyboard: true,
        zIndexOffset: chosen ? 500 : 400
      });
      // The name travels beside the dot; layoutLabels turns it into a label the
      // user can read without hovering, and click as a stand-in for the dot.
      renderedDoors.push({
        latLng: choice.center,
        text: text,
        selected: chosen,
        select: function() {
          select(choice);
        }
      });
      marker.on('click', function(e) {
        // Without this the click also lands on the map, which would drop a
        // new waypoint on top of the place being chosen for.
        L.DomEvent.stopPropagation(e);
        select(choice);
      });
      markerLayer.addLayer(marker);

      // The pin stays on the place, so the chosen door is tied back to it with a
      // dashed line: the route runs to the door, and this is the last bit on
      // foot that no router can describe.
      if (chosen && offer.placeCenter) {
        linkLayer.addLayer(L.polyline([choice.center, offer.placeCenter], ENTRANCE_LINK_STYLE));
      }
    });

    layoutLabels();
  }

  // Created lazily, because the picker may be built before the map has panes.
  // Answers with the pane's name only once there really is a pane: naming one
  // that does not exist would leave the label unplaced.
  function ensureLabelPane() {
    if (typeof map.createPane !== 'function' || typeof map.getPane !== 'function') return null;
    var pane = map.getPane(LABEL_PANE);
    if (!pane) {
      pane = map.createPane(LABEL_PANE);
      if (pane && pane.style) pane.style.zIndex = LABEL_PANE_Z_INDEX;
    }
    return pane ? LABEL_PANE : null;
  }

  // Which line of a label a click landed on, from the element under the
  // pointer: the label's lines are its inner span's direct children, in the
  // order of its entries. -1 when the click missed every line.
  function clickedLineIndex(e) {
    var target = e && e.originalEvent && e.originalEvent.target;
    if (!target || !target.closest) return -1;
    var line = target.closest('.osrm-entrance-label-inner > div');
    if (!line || !line.parentNode) return -1;
    return Array.prototype.indexOf.call(line.parentNode.children, line);
  }

  // These names come from OSM and would otherwise be read as markup. Escaped
  // by hand rather than through a detached element, so the module needs no DOM
  // of its own to build its markup.
  function escapeText(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function labelLine(entry) {
    return '<div' + (entry.selected ? ' class="osrm-entrance-label-selected"' : '') + '>' +
      escapeText(entry.text) + '</div>';
  }

  // A label sits above the door it names, anchored on it. Zero-sized so the
  // anchor is the door itself; the inner element does the drawing and is what
  // gets measured.
  //
  // It is clickable, and clicking it does what clicking its door does. That is
  // what makes a merged label usable: the doors it lists are the ones too close
  // together to aim at, so their names are the only way to pick one apart. The
  // label still sits beneath the dots, so a click that lands on a dot goes to
  // the dot.
  function addLabel(latLng, entries, merged) {
    var options = {
      icon: L.divIcon({
        className: 'osrm-entrance-label' + (merged ? ' osrm-entrance-label-merged' : ''),
        iconSize: null,
        html: '<span class="osrm-entrance-label-inner">' +
          entries.map(labelLine).join('') + '</span>'
      }),
      interactive: true,
      keyboard: false,
      zIndexOffset: 100
    };
    var pane = ensureLabelPane();
    if (pane) options.pane = pane;
    var marker = L.marker(latLng, options);
    marker.on('click', function(e) {
      // Same reason as on the dot: the map must not take this as a click.
      L.DomEvent.stopPropagation(e);
      // A single-door label is its door; a merged one picks the line clicked.
      var index = entries.length === 1 ? 0 : clickedLineIndex(e);
      var entry = entries[index];
      if (entry && typeof entry.select === 'function') entry.select();
    });
    labelLayer.addLayer(marker);
    return marker;
  }

  function labelBox(marker) {
    var el = marker.getElement && marker.getElement();
    var inner = el && el.querySelector && el.querySelector('.osrm-entrance-label-inner');
    if (!inner || !inner.getBoundingClientRect) return null;
    var r = inner.getBoundingClientRect();
    return {left: r.left, right: r.right, top: r.top, bottom: r.bottom};
  }

  // Names are only worth showing permanently while they can be read. Where the
  // boxes collide — which is a question of zoom, not of the data — the whole
  // colliding run is replaced by one label listing every door in it, anchored on
  // the first. Zooming in separates them and they come back individually.
  function layoutLabels() {
    if (!offer) return null;
    var doors = renderedDoors;

    // One label per door first, because their boxes are what the grouping is
    // decided from.
    labelLayer.clearLayers();
    var labels = doors.map(function(door) {
      return addLabel(door.latLng, [door], false);
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
      addLabel(doors[group[0]].latLng,
        group.map(function(i) {
          return doors[i];
        }),
        group.length > 1);
    });
    return groups;
  }

  // Clicking the chosen door again releases it, which is how the route goes back
  // to the place itself. There is no separate dot for that: the pin is already
  // sitting on it.
  function select(choice) {
    // A dot's handler closes over the offer it was drawn for, so a click
    // arriving after that offer was withdrawn must do nothing.
    if (!offer) return;
    var release = choice.id === offer.selectedId;
    offer.selectedId = release ? null : choice.id;
    render();
    onSelect({
      waypointIndex: offer.waypointIndex,
      placeName: offer.placeName,
      // Where the route should run to; the pin does not follow it.
      latLng: release ? offer.placeCenter : choice.center,
      markerLatLng: offer.placeCenter,
      entrance: release ? null : choice.entrance
    });
  }

  // Brings the doors into view. They are typically metres apart on a site the
  // map is showing from kilometres away, so without this the offer is a cluster
  // of overlapping dots nobody can aim at.
  //
  // Framed into the part of the map the directions pane does not cover, rather
  // than merely centred, so the pane never sits over the thing being picked
  // from.
  function focusView() {
    if (!offer) return false;
    var points = choicePoints(offer.choices, offer.placeCenter);
    if (points.length < 2) return false;
    map.fitBounds(L.latLngBounds(points), {
      maxZoom: MAX_PICKER_ZOOM,
      paddingTopLeft: L.point(FIT_PADDING, FIT_PADDING),
      paddingBottomRight: L.point(paneWidth() + FIT_PADDING, FIT_PADDING)
    });
    return true;
  }

  // The route to the place arrives a moment after the geocode that opened the
  // offer, and fitting it is an animated move: a fitBounds issued on top of one
  // is either ignored outright or undone when that animation ends. Wait for the
  // map to settle before framing, with a timer as the backstop for the case
  // where nothing moved and no moveend ever arrives.
  function focusViewWhenSettled() {
    if (!offer) return;
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

  function show(opts) {
    var choices = buildChoices(opts.placeCenter, opts.entrances);
    // A single door is still worth offering: the pin already marks the place,
    // so one dot is a real choice rather than a foregone one.
    if (choices.length < 1) {
      hide();
      return false;
    }
    offer = {
      waypointIndex: opts.waypointIndex,
      placeName: opts.placeName,
      placeCenter: opts.placeCenter || null,
      choices: choices,
      selectedId: opts.selectedId || null
    };
    attached = true;
    if (!map.hasLayer(layer)) layer.addTo(map);
    render();
    focusViewWhenSettled();
    // Which labels fit is a question of zoom, so the layout is redone after
    // every one. Detached first because show() runs again on an already-open
    // picker; Leaflet ignores a repeat registration of the same handler, but
    // relying on that makes correctness here somebody else's.
    map.off('zoomend', layoutLabels);
    map.on('zoomend', layoutLabels);
    if (typeof document !== 'undefined') {
      document.removeEventListener('keydown', onKeyDown);
      document.addEventListener('keydown', onKeyDown);
    }
    return true;
  }

  function hide() {
    if (!attached) return;
    attached = false;
    offer = null;
    renderedDoors = [];
    map.off('zoomend', layoutLabels);
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
      return !!offer;
    },
    getWaypointIndex: function() {
      return offer ? offer.waypointIndex : null;
    },
    getSelectedId: function() {
      return offer ? offer.selectedId : null;
    }
  };
}

module.exports = {
  routableEntrances: routableEntrances,
  boxesOverlap: boxesOverlap,
  clusterOverlappingLabels: clusterOverlappingLabels,
  entranceName: entranceName,
  waypointRole: waypointRole,
  buildChoices: buildChoices,
  choicePoints: choicePoints,
  createEntrancePicker: createEntrancePicker
};
