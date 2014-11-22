"use strict";

var defaultView = {
  center: L.latLng(48.84, 10.10),
  zoom: 5,
  waypoints: [],
  language: 'en'
};

var defaultControl = {
  geocoder: L.Control.Geocoder.nominatim(),
  routeWhileDragging: true,
  addWaypoints: false,
  waypointMode: 'snap',
};

module.exports = {
  viewDefaults: defaultView,
  controlDefaults: defaultControl,
};
