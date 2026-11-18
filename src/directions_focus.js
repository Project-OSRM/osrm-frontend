'use strict';

var mobileViewport = require('./mobile_viewport');
var waypointMarkerLatLng = require('./entrance_waypoints').waypointMarkerLatLng;

function attach(map, control, panel) {
  function focusCoordinate(coordinate) {
    if (coordinate) map.panTo(mobileViewport.centerForTarget(map, coordinate, map.getZoom()));
  }

  function click(event) {
    var target = event.target;
    if (!target.closest || target.closest('.leaflet-routing-remove-waypoint, .leaflet-routing-waypoint-handle, a')) return;
    var waypointRow = target.closest('.leaflet-routing-geocoder');
    if (waypointRow && panel.contains(waypointRow)) {
      var rows = Array.prototype.slice.call(panel.querySelectorAll('.leaflet-routing-geocoder'));
      var waypoints = control.getWaypoints();
      var waypoint = waypoints[rows.indexOf(waypointRow)];
      if (waypoint) focusCoordinate(waypointMarkerLatLng(waypoint));
      // Leave input focus, editing and text selection to the geocoder.
      return;
    }

    var instructionRow = target.closest('.osrm-turn-list tr');
    if (!instructionRow || !panel.contains(instructionRow)) return;
    var card = instructionRow.closest('.leaflet-routing-alt');
    var cards = Array.prototype.slice.call(panel.querySelectorAll('.leaflet-routing-alt'));
    var route = (control._routes || [])[cards.indexOf(card)];
    var instruction = route && route.instructions && route.instructions[instructionRow.sectionRowIndex];
    var coordinate = instruction && route.coordinates && route.coordinates[instruction.index];
    if (!coordinate) return;
    // Replace LRM's full-map pan and keep the click from selecting an alternative.
    // This also supports the first instruction, whose coordinate index is zero.
    event.stopImmediatePropagation();
    event.preventDefault();
    focusCoordinate(coordinate);
  }

  panel.addEventListener('click', click, true);
  return { destroy: function() {
    panel.removeEventListener('click', click, true);
  } };
}

module.exports = { attach: attach };
