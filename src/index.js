"use strict";

var itineraryBuilder = require('./itinerary_builder.js');
var createGeocoder = require('./geocoder.js');
var theme = require('./directions_theme.js');

var mapbox = L.tileLayer('https://{s}.tiles.mapbox.com/v3/dennisl.4e2aab76/{z}/{x}/{y}.png',
    {attribution: '&copy; <a href="http://mapbox.com/">MapBox</a> &copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'}
    );

var map = L.map('map', {layers: [mapbox], zoomControl: false}).setView([48.84, 10.10], 5);

var baseMaps = {
  'Mapbox': mapbox,
};
L.control.layers(baseMaps).addTo(map);

var options = L.extend({
    geocoder: L.Control.Geocoder.nominatim(),
    routeWhileDragging: true,
    addWaypoints: false,
    waypointMode: 'snap',
}, theme.options);

var lrm = L.Routing.control(options);
lrm.addTo(map);

theme.setup(lrm);
