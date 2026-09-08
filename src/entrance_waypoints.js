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

  // The cases where there is legitimately nothing to notify are checked rather
  // than caught: no result, one too far to be this waypoint's place, no
  // waypoint at those coordinates, or a plan that does not exist yet — which is
  // ordinary while the app is still starting up.
  function notify(latLng, results) {
    var result = results && results.length ? results[0] : null;
    if (!result || !result.center) return;
    if (typeof result.center.distanceTo === 'function' &&
        result.center.distanceTo(latLng) >= tolerance) return;
    var index = waypointIndexAt(latLng);
    if (index === -1) return;
    var plan = typeof getPlan === 'function' ? getPlan() : null;
    if (!plan || typeof plan.fire !== 'function') return;
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
      } catch (e) {
        // Anything reaching here is a bug, but it must not take the waypoint's
        // name down with it: LRM has already been called back, and a throw on
        // this path would leave the waypoint half-named. Reported rather than
        // swallowed, so it is findable.
        console.warn('osrm-entrances: offering a reverse-geocoded place failed', e);
      }
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
 * @returns {{onGeocodeResult: function, applySelection: function,
 *   refresh: function, spliceWaypoints: function, hideWaypoint: function,
 *   hide: function, isOpen: function, claimView: function,
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
  // The last geocoding result seen for each waypoint, kept so a change of
  // travel mode or of the waypoint's role can re-apply the filters without a
  // fresh geocode. Keyed by waypoint index, because several waypoints can be
  // showing their doors at once; each entry holds the event and the role it was
  // last filtered under, so a role change can be told from a mere renumbering.
  var lastEvents = {};
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
    fetchOutline: options.fetchOutline,
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
    // A copy of our own: `spliceWaypoints` renumbers the index it carries, and
    // the event LRM fired belongs to LRM and its other listeners.
    lastEvents[e.waypointIndex] = {
      event: {waypointIndex: e.waypointIndex, waypoint: e.waypoint, value: e.value},
      role: role
    };
    // Read once: the mode is live, and filtering the doors by one value while
    // marking them for another would mark a door the filter had just judged on
    // different terms.
    var activeMode = mode();
    var entrances = result
      ? entrancePicker.routableEntrances(result.entrances, role, activeMode)
      : [];
    if (!entrances.length) {
      // Only this waypoint's dots go. Naming a start with no doors of its own
      // must not withdraw the destination's — that is the whole reason offers
      // are per-waypoint.
      picker.hideWaypoint(e.waypointIndex);
      return false;
    }

    var shown = picker.show({
      waypointIndex: e.waypointIndex,
      placeName: result.name,
      placeCenter: result.center,
      placeBounds: result.bbox,
      entrances: entrances,
      place: result,
      // The picker marks doors differently per mode, so it gets the same value
      // the filtering above used.
      mode: activeMode,
      frame: frame
    });
    if (shown && frame) viewClaimed = true;
    return shown;
  }

  // Re-applies the filters to every place remembered. Switching from foot to
  // car can forbid the very door a waypoint sits on, and can equally make one
  // usable that was not, so this runs whether or not an offer is currently on
  // screen — a place whose doors are all shut to cars comes back when the
  // traveller switches to walking. It is `hide()` and `hideWaypoint()` that end
  // an offer for good, by forgetting the place along with it.
  //
  // The redraw stays where it is: the user asked for a different profile, not
  // to be taken back to the doors.
  function refresh() {
    var any = false;
    Object.keys(lastEvents).forEach(function(key) {
      if (onGeocodeResult(lastEvents[key].event, false)) any = true;
    });
    return any;
  }

  // Where a waypoint that was spliced out has reappeared among the ones spliced
  // in, or -1 if it is genuinely gone. LRM's reverse button replaces the whole
  // list — spliceWaypoints(0, length, ...the same waypoint objects, reordered)
  // — so "removed" and "added" overlap, and only object identity tells a real
  // removal from a waypoint that merely changed places. LRM passes a waypoint
  // through untouched when it already has a `latLng`, so the objects survive.
  function addedIndexOf(added, waypoint) {
    if (!waypoint || !added) return -1;
    for (var i = 0; i < added.length; i++) {
      if (added[i] === waypoint) return i;
    }
    return -1;
  }

  /**
   * Follows a splice of the waypoint list, keeping the remembered results lined
   * up with the waypoints they belong to. Without this a refresh after a splice
   * would re-offer a place against the wrong waypoint.
   *
   * A splice can also change what a waypoint *is*: reversing start and
   * destination, or adding one after it so it becomes a via. Which doors are on
   * offer follows directly from that role — an entrance=exit can be left
   * through but not entered — so every waypoint whose role changed is
   * re-filtered against the result already remembered for it. Without this,
   * reversing a route left a door that is only valid at the new end unoffered
   * until the address was typed again.
   */
  function spliceWaypoints(e) {
    var index = e && typeof e.index === 'number' ? e.index : 0;
    var removed = e && typeof e.nRemoved === 'number' ? e.nRemoved : 0;
    var addedList = e && e.added ? e.added : [];
    var added = addedList.length;
    var delta = added - removed;
    var moved = {};
    Object.keys(lastEvents).forEach(function(key) {
      var at = Number(key);
      var record = lastEvents[key];
      var to;
      if (at < index) {
        // Untouched: it sits before the splice.
        moved[at] = record;
        return;
      }
      if (at < index + removed) {
        var reAdded = addedIndexOf(addedList, record.event && record.event.waypoint);
        // Its waypoint is gone, and so is the place it belonged to.
        if (reAdded === -1) return;
        to = index + reAdded;
        // Its offer is inside the range spliceOffers is about to clear, and
        // spliceOffers cannot tell a waypoint that moved from one that went.
        // Whatever its role does, the offer has to be put back.
        record.reoffer = true;
      } else {
        to = at + delta;
      }
      // The event carries the index the picker is keyed by, so it has to move
      // with it. The event is ours — a copy made when it was remembered.
      if (record.event) record.event.waypointIndex = to;
      moved[to] = record;
    });
    lastEvents = moved;
    // Renumber the offers first, so the re-offering below lands on the indexes
    // the waypoints now have.
    picker.spliceOffers(index, removed, added);

    var count = plan && plan._waypoints ? plan._waypoints.length : 0;
    Object.keys(lastEvents).forEach(function(key) {
      var record = lastEvents[key];
      if (!record || !record.event) return;
      var role = entrancePicker.waypointRole(Number(key), count);
      var reoffer = record.reoffer;
      delete record.reoffer;
      // A role change alters which doors are on offer; a waypoint carried
      // through the removed range has had its offer cleared and needs it back
      // whether or not its role moved with it.
      if (!reoffer && role === record.role) return;
      onGeocodeResult(record.event, false);
    });
  }

  return {
    onGeocodeResult: onGeocodeResult,
    applySelection: applySelection,
    refresh: refresh,
    spliceWaypoints: spliceWaypoints,
    hideWaypoint: function(waypointIndex) {
      delete lastEvents[waypointIndex];
      picker.hideWaypoint(waypointIndex);
    },
    hide: function() {
      lastEvents = {};
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
  createReverseNotifier: createReverseNotifier,
  entranceWaypointName: entranceWaypointName,
  createEntranceWaypoints: createEntranceWaypoints
};
