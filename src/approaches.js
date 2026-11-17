'use strict';

// Per-waypoint approach side, as OSRM's `approaches` request parameter.
//
// OSRM takes one entry per coordinate, separated by ';': `curb` arrives at and
// leaves the waypoint on the waypoint's own side of the road (which side that
// is follows the profile's driving side), `opposite` on the far side, and
// `unrestricted` lets the router choose. An empty entry means the default.
//
// The value lives on the waypoint, as `waypoint.options.approach`. Leaflet
// Routing Machine copies a waypoint's options into its request copies and into
// the snapped waypoints it gets back, so the value follows its waypoint through
// reordering, reversing and dragging without an index-based list to keep in
// step.

var UNRESTRICTED = 'unrestricted';
var CURB = 'curb';
var OPPOSITE = 'opposite';

// The order the row toggle cycles through.
var APPROACH_VALUES = [UNRESTRICTED, CURB, OPPOSITE];

// Anything that is not one of the three values is the default. The value can
// arrive from a shared link, so it is not trusted to be a string, nor to be
// lower case.
function normalizeApproach(value) {
  if (typeof value !== 'string') return UNRESTRICTED;
  var lowered = value.trim().toLowerCase();
  return APPROACH_VALUES.indexOf(lowered) === -1 ? UNRESTRICTED : lowered;
}

function nextApproach(value) {
  var index = APPROACH_VALUES.indexOf(normalizeApproach(value));
  return APPROACH_VALUES[(index + 1) % APPROACH_VALUES.length];
}

function approachOf(waypoint) {
  return normalizeApproach(waypoint && waypoint.options && waypoint.options.approach);
}

// Sets the approach, keeping whatever else the waypoint's options carry.
// Setting the default removes the key, so a waypoint nobody touched and one
// that was set back look the same.
function setApproach(waypoint, value) {
  if (!waypoint) return waypoint;
  var approach = normalizeApproach(value);
  // Nothing to record and nothing to remove: leave the waypoint as it is,
  // rather than give it an empty options object.
  if (approach === UNRESTRICTED && !waypoint.options) return waypoint;
  var options = Object.assign({}, waypoint.options);
  if (approach === UNRESTRICTED) {
    delete options.approach;
  } else {
    options.approach = approach;
  }
  waypoint.options = options;
  return waypoint;
}

// The value of the `approaches` parameter (and of the share link's `ap`) for a
// list of waypoints: 'curb;;opposite'. Undefined when no waypoint is
// restricted, so a request, or a link, without restrictions is unchanged.
function formatApproaches(waypoints) {
  if (!Array.isArray(waypoints)) return undefined;
  var entries = waypoints.map(function(waypoint) {
    var approach = approachOf(waypoint);
    return approach === UNRESTRICTED ? '' : approach;
  });
  return entries.some(function(entry) {
    return entry !== '';
  }) ? entries.join(';') : undefined;
}

// The inverse of formatApproaches: exactly `count` normalized values. A list
// that is too short is padded and one that is too long is cut, so a stale or
// hand-edited link cannot misalign the waypoints that follow.
function parseApproaches(text, count) {
  var entries = typeof text === 'string' ? text.split(';') : [];
  var parsed = [];
  for (var i = 0; i < count; i++) {
    parsed.push(normalizeApproach(entries[i]));
  }
  return parsed;
}

// Applies parsed approaches to waypoints by position.
function applyApproaches(waypoints, text) {
  if (!Array.isArray(waypoints)) return waypoints;
  var parsed = parseApproaches(text, waypoints.length);
  waypoints.forEach(function(waypoint, i) {
    setApproach(waypoint, parsed[i]);
  });
  return waypoints;
}

module.exports = {
  UNRESTRICTED: UNRESTRICTED,
  CURB: CURB,
  OPPOSITE: OPPOSITE,
  APPROACH_VALUES: APPROACH_VALUES,
  normalizeApproach: normalizeApproach,
  nextApproach: nextApproach,
  approachOf: approachOf,
  setApproach: setApproach,
  formatApproaches: formatApproaches,
  parseApproaches: parseApproaches,
  applyApproaches: applyApproaches
};
