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
  // The result the picker is currently showing, kept so a change of travel mode
  // can re-apply the access rules without a fresh geocode.
  var lastEvent = null;

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
    lastEvent = e;
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
      picker.hide();
      return false;
    }

    return picker.show({
      waypointIndex: e.waypointIndex,
      placeName: result.name,
      placeCenter: result.center,
      placeBounds: result.bbox,
      entrances: entrances,
      place: result
    });
  }

  // Re-applies the filters to the place already on screen. Switching from foot
  // to car can forbid the very door the waypoint sits on, so the offer has to be
  // recomputed rather than left stale.
  function refresh() {
    if (!lastEvent || !picker.isOpen()) return false;
    return onGeocodeResult(lastEvent);
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
  entranceWaypointName: entranceWaypointName,
  createEntranceWaypoints: createEntranceWaypoints
};
