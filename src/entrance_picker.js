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
  // Read live rather than captured once: the directions pane is still hidden
  // when the picker opens and slides in when the route arrives.
  var paneWidth = typeof options.paneWidth === 'function' ? options.paneWidth : function() {
    return 0;
  };
  // Two groups, so each can be cleared without disturbing the other. Markers
  // sit in Leaflet's marker pane and paths in the overlay pane, so the dots stay
  // above the dashed link whatever the draw order.
  //
  // The dashed link runs from the chosen door back to the pin, which never
  // moves.
  var linkLayer = L.layerGroup();
  var markerLayer = L.layerGroup();
  var layer = L.layerGroup([linkLayer, markerLayer]);
  var offer = null;
  // Whether the layer and the document listener are in place. Tracked rather
  // than inferred from `offer`, because that is cleared before the teardown
  // runs.
  var attached = false;

  function onKeyDown(e) {
    if (e && e.key === 'Escape') hide();
  }

  // Every door stays on the map for as long as the picker is open, chosen or
  // not, so the alternatives are always one click away. The chosen one is marked
  // rather than removed.
  function render() {
    markerLayer.clearLayers();
    linkLayer.clearLayers();
    if (!offer) return;

    offer.choices.forEach(function(choice) {
      var chosen = choice.id === offer.selectedId;
      var className = 'osrm-entrance-marker osrm-entrance-marker-' + choice.kind +
        (chosen ? ' osrm-entrance-marker-selected' : '');
      var marker = L.marker(choice.center, {
        icon: L.divIcon({className: className, iconSize: [18, 18], iconAnchor: [9, 9], html: ''}),
        alt: entranceName(choice.entrance) || '',
        keyboard: true,
        zIndexOffset: chosen ? 500 : 400
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
    linkLayer.clearLayers();
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
  entranceName: entranceName,
  waypointRole: waypointRole,
  buildChoices: buildChoices,
  choicePoints: choicePoints,
  createEntrancePicker: createEntrancePicker
};
