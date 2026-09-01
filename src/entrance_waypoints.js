'use strict';

var entrancePicker = require('./entrance_picker');

/**
 * Where a waypoint's pin belongs when it differs from where the route runs to.
 * Stashed on LRM's own waypoint object because that is what createMarker is
 * handed; exported so the map's createMarker can read it back.
 */
var MARKER_LATLNG = '_entranceMarkerLatLng';

/**
 * The position to draw a waypoint's pin at: the place it stands for, falling
 * back to wherever the route runs to.
 */
function waypointMarkerLatLng(wp) {
  return (wp && wp[MARKER_LATLNG]) || (wp && wp.latLng);
}

/**
 * Wires the entrance picker to the routing plan.
 *
 * A geocoded place drops its waypoint on the centroid. For a large site that is
 * nowhere reachable — BER's centroid sits on the airfield, 1.5 km from the
 * terminal doors — so Nominatim's entrance nodes are offered as clickable dots
 * on the map, together with the place centre so the move can always be undone.
 *
 * The choice is always the user's: nothing is applied automatically. Which door
 * is usable depends on where the router can actually get to, and the tagging
 * does not say — the Pergamonmuseum's `entrance=main` node sits 90 m from
 * anything the walking network reaches while its `entrance=yes` node is on the
 * path — so asserting a door would be confidently wrong about as often as right.
 *
 * Everything this module touches arrives through `options`, so the whole
 * feature can be exercised against fakes rather than a live map.
 *
 * @module entrance_waypoints
 */

// The wording for a door with no name of its own. An exit is only offered at an
// origin, where calling it an entrance would contradict why it is on offer.
function entranceTypeKey(type) {
  if (type === 'exit') return 'exit';
  return type === 'main' ? 'main entrance' : 'entrance';
}

/**
 * Appends the door to a place name, so the geocoder input says where the
 * waypoint actually sits. Returns the name unchanged for the place centre.
 *
 * A door that names itself in OSM is named here too, matching what its tooltip
 * says on the map — otherwise picking "Eingang Ravelinplatz" would leave an
 * input reading "(entrance)", and the two would not obviously be the same thing.
 */
function entranceWaypointName(placeName, entrance, translate) {
  if (!entrance) return placeName;
  var t = typeof translate === 'function' ? translate : function(key) {
    return key;
  };
  var suffix = entrancePicker.entranceName(entrance) || t(entranceTypeKey(entrance.type));
  return placeName + ' (' + suffix + ')';
}

// LRM's own default for maxGeocoderTolerance, in metres. Beyond it LRM labels
// the waypoint with bare coordinates instead of the place it found.
var MAX_GEOCODER_TOLERANCE = 200;

/**
 * Wraps the geocoder handed to LRM's plan so a reverse-geocoded waypoint still
 * reaches the picker.
 *
 * LRM fires `geocoded` only when the user picks from the autocomplete. A
 * waypoint that arrives with coordinates and no name — restored from a shared
 * URL, dropped by a click on the map, dragged somewhere new — is named by
 * GeocoderElement.update() calling `geocoder.reverse` directly, and that result
 * is discarded once the name has been taken out of it. The entrance list goes
 * with it, so a place whose doors were on offer a moment ago has none after a
 * reload, even though the answer is sitting in the cache.
 *
 * A reverse result has the same shape as a search result, so it is re-fired as
 * `waypointgeocoderesult` against whichever waypoint the coordinates belong to.
 *
 * No guard against reopening the picker unbidden is needed: `update()` only
 * reverse-geocodes when the waypoint has no name, and LRM's one forced call
 * clears the name first, so every reverse arriving here is a waypoint being
 * named for the first time.
 *
 * @param {object} options
 * @param {object} options.geocoder — the geocoder LRM would otherwise be given
 * @param {function} options.getPlan — () => the plan, read late because the plan
 *   is built from the geocoder and cannot exist yet
 * @param {number} [options.tolerance] — metres; beyond this LRM discards the
 *   name, and offering that place's doors would offer doors of somewhere the
 *   user did not pick
 * @returns {object} a geocoder to hand to the plan
 */
function createReverseNotifier(options) {
  options = options || {};
  var geocoder = options.geocoder;
  var getPlan = options.getPlan;
  if (!geocoder || typeof geocoder.reverse !== 'function') return geocoder;
  var tolerance = typeof options.tolerance === 'number'
    ? options.tolerance : MAX_GEOCODER_TOLERANCE;

  // Bound rather than copied, so the original keeps its own `this` whatever it
  // closes over.
  var wrapped = {};
  for (var key in geocoder) {
    wrapped[key] = typeof geocoder[key] === 'function'
      ? geocoder[key].bind(geocoder) : geocoder[key];
  }

  function waypointIndexAt(latLng) {
    var plan = typeof getPlan === 'function' ? getPlan() : null;
    var waypoints = plan && plan._waypoints;
    if (!waypoints || !latLng) return -1;
    for (var i = 0; i < waypoints.length; i++) {
      var wp = waypoints[i];
      var at = wp && wp.latLng;
      if (!at) continue;
      if (at === latLng) return i;
      if (at.lat === latLng.lat && at.lng === latLng.lng) return i;
    }
    return -1;
  }

  function notify(latLng, results) {
    var result = results && results.length ? results[0] : null;
    if (!result || !result.center) return;
    if (typeof result.center.distanceTo === 'function' &&
        result.center.distanceTo(latLng) >= tolerance) return;
    var index = waypointIndexAt(latLng);
    if (index === -1) return;
    var plan = getPlan();
    plan.fire('waypointgeocoderesult', {
      waypointIndex: index,
      waypoint: plan._waypoints[index],
      value: result
    });
  }

  wrapped.reverse = function(latLng, scale, cb, context) {
    return geocoder.reverse(latLng, scale, function(results) {
      // LRM's callback first: it sets the waypoint's name, and the picker's
      // offer is built against a waypoint that has already been named.
      if (typeof cb === 'function') cb.call(context, results);
      try {
        notify(latLng, results);
      } catch (e) {}
    }, context);
  };

  return wrapped;
}

/**
 * @param {object} options
 * @param {L.Map} options.map
 * @param {L.Routing.Plan} options.plan
 * @param {object} options.routeFitTracker — from route_zoom
 * @param {function} [options.translate] — (key) => localized string
 * @param {function} [options.fetchOutline] — (place) => Promise<GeoJSON|null>
 * @param {function} [options.paneWidth] — () => width of the directions pane
 * @param {function} [options.mode] — () => the active routing profile, read live
 *   so switching between car, bike and foot re-applies the access rules
 * @param {function} [options.createPicker] — injection seam for tests
 * @returns {{onGeocodeResult: function, hide: function, isOpen: function,
 *   focusView: function, waypointName: function}}
 */
function createEntranceWaypoints(options) {
  options = options || {};
  var plan = options.plan;
  var routeFitTracker = options.routeFitTracker;
  var translate = typeof options.translate === 'function' ? options.translate : function(key) {
    return key;
  };
  var createPicker = options.createPicker || entrancePicker.createEntrancePicker;
  var mode = typeof options.mode === 'function' ? options.mode : function() {
    return null;
  };
  // The last geocoding result seen for each waypoint, kept so a change of travel
  // mode can re-apply the access rules to everything on screen without a fresh
  // geocode. Keyed by waypoint index, because several waypoints can be showing
  // their doors at once.
  var lastEvents = {};

  // Points one waypoint at a new location without going through
  // spliceWaypoints, which recreates the geocoder inputs and would steal the
  // focus LRM just handed to the next one. Reaches into the plan's internals
  // because LRM offers no public way to move a single waypoint without that
  // rebuild.
  //
  // `markerLatLng` is where the pin should be drawn, which is not where the
  // route runs to: choosing a door routes to the door while the pin stays on
  // the place the user actually searched for. createMarker reads it back off
  // the waypoint.
  function setWaypointInPlace(index, latLng, name, markerLatLng) {
    var wp = plan && plan._waypoints && plan._waypoints[index];
    if (!wp) return false;
    wp.latLng = latLng;
    wp.name = name;
    if (markerLatLng && markerLatLng !== latLng) {
      wp[MARKER_LATLNG] = markerLatLng;
    } else {
      delete wp[MARKER_LATLNG];
    }
    if (plan._geocoderElems && plan._geocoderElems[index]) {
      plan._geocoderElems[index].setValue(name);
    }
    plan._updateMarkers();
    // The user aimed at a point on the map, so the recomputed route must not
    // drag the view off it. The route can still force a refit when it would
    // otherwise run under the directions pane; the picker reclaims the view
    // afterwards.
    if (routeFitTracker) routeFitTracker.waypointDragStarted();
    plan._fireChanged();
    return true;
  }

  function applySelection(choice) {
    return setWaypointInPlace(choice.waypointIndex, choice.latLng,
      entranceWaypointName(choice.placeName, choice.entrance, translate),
      choice.markerLatLng);
  }

  var picker = createPicker(options.map, {
    translate: translate,
    fetchOutline: options.fetchOutline,
    paneWidth: options.paneWidth,
    onSelect: applySelection
  });

  function onGeocodeResult(e) {
    var result = e && e.value;
    lastEvents[e.waypointIndex] = e;
    // Two independent filters. Which end of the route this waypoint is decides
    // the direction a door must work in — an entrance=exit can only be left
    // through, an entrance=entrance only entered. The travel mode then decides
    // which of those the traveller may actually use, from the door's own OSM
    // access tags.
    var count = plan && plan._waypoints ? plan._waypoints.length : 0;
    var role = entrancePicker.waypointRole(e.waypointIndex, count);
    var entrances = result
      ? entrancePicker.routableEntrances(result.entrances, role, mode())
      : [];
    if (!entrances.length) {
      // Only this waypoint's dots go. Naming a start with no doors of its own
      // must not withdraw the destination's — that is the whole reason offers
      // are per-waypoint.
      picker.hideWaypoint(e.waypointIndex);
      return false;
    }

    return picker.show({
      waypointIndex: e.waypointIndex,
      // The picker marks doors differently per mode, so it needs the same value
      // the filtering above used.
      mode: mode(),
      placeName: result.name,
      placeCenter: result.center,
      placeBounds: result.bbox,
      entrances: entrances,
      place: result
    });
  }

  // Re-applies the filters to every place on screen. Switching from foot to car
  // can forbid the very door a waypoint sits on, so each open offer is
  // recomputed rather than left stale.
  function refresh() {
    if (!picker.isOpen()) return false;
    var any = false;
    Object.keys(lastEvents).forEach(function(key) {
      if (!picker.isOpenFor(Number(key))) return;
      if (onGeocodeResult(lastEvents[key])) any = true;
    });
    return any;
  }

  return {
    onGeocodeResult: onGeocodeResult,
    applySelection: applySelection,
    refresh: refresh,
    hide: function() {
      lastEvents = {};
      picker.hide();
    },
    isOpen: function() {
      return picker.isOpen();
    },
    focusView: function() {
      picker.focusView();
    },
    waypointName: function(placeName, entrance) {
      return entranceWaypointName(placeName, entrance, translate);
    }
  };
}

module.exports = {
  waypointMarkerLatLng: waypointMarkerLatLng,
  createReverseNotifier: createReverseNotifier,
  entranceWaypointName: entranceWaypointName,
  createEntranceWaypoints: createEntranceWaypoints
};
