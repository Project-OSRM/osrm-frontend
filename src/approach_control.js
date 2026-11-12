'use strict';

// The approach toggle in each waypoint row.
//
// A small button between the input and the reorder grip. Each press moves the
// waypoint on to the next approach: any side, curb side, opposite side. It takes
// keyboard focus, and Enter or Space presses it, so choosing an approach does
// not depend on a pointer.
//
// The rows are rebuilt by Leaflet Routing Machine every time the waypoints
// change, so nothing here holds on to a row: attachToPlan runs after every
// rebuild and wires whatever rows are there now.

var L = require('leaflet');
var approaches = require('./approaches');
var localization = require('./localization');
var waypointMarker = require('./waypoint_marker');

// The row and pin class names are those waypoint_reorder.js builds the rows
// with. They are repeated here rather than required from it, because that
// module creates the toggle through this one.
var ROW_CLASS = 'leaflet-routing-geocoder';
var PIN_CLASS = 'leaflet-routing-waypoint-pin';
var TOGGLE_CLASS = 'leaflet-routing-approach-toggle';

var LABEL_KEYS = {};
LABEL_KEYS[approaches.UNRESTRICTED] = 'Approach: any side';
LABEL_KEYS[approaches.CURB] = 'Approach: curb side';
LABEL_KEYS[approaches.OPPOSITE] = 'Approach: opposite side';

function labelFor(approach, language) {
  return localization.t(language, LABEL_KEYS[approach]);
}

// Shows `approach` on a toggle: the stylesheet draws the icon from
// data-approach, and the label says the same in words for everything that
// cannot see the icon.
function render(toggle, approach, language) {
  var label = labelFor(approach, language);
  toggle.setAttribute('data-approach', approach);
  toggle.setAttribute('title', label);
  toggle.setAttribute('aria-label', label);
}

// Creates the toggle in `row`, after whatever the row already holds, so the
// caller decides where in the row it sits. It starts on the default, and
// attachToPlan sets the real value.
function createToggle(row, language) {
  var toggle = L.DomUtil.create('span', TOGGLE_CLASS, row);
  toggle.setAttribute('role', 'button');
  toggle.setAttribute('tabindex', '0');
  render(toggle, approaches.UNRESTRICTED, language);
  return toggle;
}

function rowsOf(container) {
  return Array.prototype.slice.call(container.querySelectorAll('.' + ROW_CLASS));
}

function toggleOf(row) {
  return row.querySelector('.' + TOGGLE_CLASS);
}

// The pin in the row shows the approach the same way the map's pin does.
function renderPin(row, index, count, approach) {
  var pin = row.querySelector('.' + PIN_CLASS);
  if (!pin) return;
  pin.style.backgroundImage = 'url("' + waypointMarker.panelIconUrlFor(index, count, approach) + '")';
}

// Moves the waypoint at `index` on to its next approach. The waypoints are set
// again, as they are for a reorder: that re-routes, redraws the pins and the
// rows, and writes the share link, all from the one change.
function change(plan, index) {
  var waypoints = plan.getWaypoints();
  var waypoint = waypoints[index];
  if (!waypoint) return;
  var approach = approaches.nextApproach(approaches.approachOf(waypoint));
  approaches.setApproach(waypoint, approach);
  // Fired before the change so a listener can decide how to treat the
  // waypointschanged and route that follow.
  plan.fire('waypointapproachchange', {index: index, approach: approach});
  plan.setWaypoints(waypoints);
  focusToggle(plan._geocoderContainer, index);
}

function focusToggle(container, index) {
  if (!container) return;
  var row = rowsOf(container)[index];
  var toggle = row && toggleOf(row);
  if (toggle) toggle.focus();
}

// Call after the plan has rebuilt its geocoder rows.
function attachToPlan(plan) {
  var container = plan._geocoderContainer;
  if (!container) return;
  var rows = rowsOf(container);
  var waypoints = plan.getWaypoints();
  var language = plan.options && plan.options.language;
  rows.forEach(function(row, i) {
    var toggle = toggleOf(row);
    if (!toggle) return;
    var approach = approaches.approachOf(waypoints[i]);
    render(toggle, approach, language);
    renderPin(row, i, rows.length, approach);
    L.DomEvent.on(toggle, 'click', function(e) {
      L.DomEvent.stop(e);
      change(plan, i);
    });
    L.DomEvent.on(toggle, 'keydown', function(e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      L.DomEvent.stop(e);
      change(plan, i);
    });
  });
}

// Re-labels the toggles when the interface language changes; the rows are not
// rebuilt for that.
function updateLabels(plan, language) {
  var container = plan && plan._geocoderContainer;
  if (!container) return;
  var waypoints = plan.getWaypoints();
  rowsOf(container).forEach(function(row, i) {
    var toggle = toggleOf(row);
    if (toggle) render(toggle, approaches.approachOf(waypoints[i]), language);
  });
}

module.exports = {
  createToggle: createToggle,
  attachToPlan: attachToPlan,
  updateLabels: updateLabels,
  labelFor: labelFor,
  TOGGLE_CLASS: TOGGLE_CLASS
};
