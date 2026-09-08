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
 * on the map.
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
 * A door that names itself in OSM is named here too, so picking "Eingang
 * Ravelinplatz" does not leave an input reading "(entrance)".
 */
function entranceWaypointName(placeName, entrance, translate) {
  if (!entrance) return placeName;
  var t = typeof translate === 'function' ? translate : function(key) {
    return key;
  };
  var suffix = entrancePicker.entranceName(entrance) || t(entranceTypeKey(entrance.type));
  return placeName + ' (' + suffix + ')';
}

/**
 * @param {object} options
 * @param {L.Map} options.map
 * @param {L.Routing.Plan} options.plan
 * @param {object} options.routeFitTracker — from route_zoom
 * @param {function} [options.translate] — (key) => localized string
 * @param {function} [options.paneWidth] — () => width of the directions pane
 * @param {function} [options.mode] — () => the active routing profile, read live
 *   so switching between car, bike and foot re-applies the access rules
 * @param {function} [options.createPicker] — injection seam for tests
 * @returns {{onGeocodeResult: function, applySelection: function,
 *   refresh: function, hide: function, isOpen: function, claimView: function,
 *   waypointName: function}}
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
  // The last geocoding result seen, kept so a change of travel mode can
  // re-apply the filters without a fresh geocode.
  var lastEvent = null;
  // Set when a geocode opens an offer and the picker frames its doors. The
  // route that follows would otherwise be fitted over that framing; index.js
  // asks for the claim once per route and stands down if it is set.
  var viewClaimed = false;

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
    // drag the view off it.
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
    paneWidth: options.paneWidth,
    onSelect: applySelection
  });

  // `frame` is false for the internal re-filter below; the plan's event handler
  // passes only the event, and a fresh geocode frames its doors.
  function onGeocodeResult(e, frame) {
    frame = frame !== false;
    var result = e && e.value;
    // Two independent filters. Which end of the route this waypoint is decides
    // the direction a door must work in — an entrance=exit can only be left
    // through, an entrance=entrance only entered. The travel mode then decides
    // which of those the traveller may actually use, from the door's own OSM
    // access tags.
    var count = plan && plan._waypoints ? plan._waypoints.length : 0;
    var role = entrancePicker.waypointRole(e.waypointIndex, count);
    lastEvent = e;
    // Read once: the mode is live, and filtering the doors by one value while
    // marking them for another would mark a door the filter had just judged on
    // different terms.
    var activeMode = mode();
    var entrances = result
      ? entrancePicker.routableEntrances(result.entrances, role, activeMode)
      : [];
    if (!entrances.length) {
      picker.hide();
      return false;
    }

    var shown = picker.show({
      waypointIndex: e.waypointIndex,
      placeName: result.name,
      placeCenter: result.center,
      entrances: entrances,
      // The picker marks doors differently per mode, so it gets the same value
      // the filtering above used.
      mode: activeMode,
      frame: frame
    });
    if (shown && frame) viewClaimed = true;
    return shown;
  }

  // Re-applies the filters to the place last geocoded. Switching from foot to
  // car can forbid the very door a waypoint sits on, and can equally make one
  // usable that was not, so this runs whether or not the offer is currently on
  // screen — a place whose doors are all shut to cars comes back when the
  // traveller switches to walking. It is `hide()` that ends an offer for good,
  // by forgetting the place along with it.
  //
  // The redraw stays where it is: the user asked for a different profile, not
  // to be taken back to the doors.
  function refresh() {
    if (!lastEvent) return false;
    return onGeocodeResult(lastEvent, false);
  }

  return {
    onGeocodeResult: onGeocodeResult,
    applySelection: applySelection,
    refresh: refresh,
    hide: function() {
      lastEvent = null;
      picker.hide();
    },
    isOpen: function() {
      return picker.isOpen();
    },
    // Whether the next route belongs to a picker that has just framed its
    // doors. Answering consumes the claim, so only one route stands down.
    //
    // An offer withdrawn before that route arrives — Escape, a drag, a later
    // geocode with no usable door — takes its claim with it. Otherwise the
    // route would stand down for a picker that is no longer on screen, and
    // the map would be left showing wherever the doors had been.
    claimView: function() {
      var claimed = viewClaimed && picker.isOpen();
      viewClaimed = false;
      return claimed;
    },
    waypointName: function(placeName, entrance) {
      return entranceWaypointName(placeName, entrance, translate);
    }
  };
}

module.exports = {
  waypointMarkerLatLng: waypointMarkerLatLng,
  entranceWaypointName: entranceWaypointName,
  createEntranceWaypoints: createEntranceWaypoints
};
