"use strict";

var itineraryBuilder = require('./itinerary_builder.js');
var createGeocoder = require('./geocoder.js');
var links = require('./links.js');
var options = require('./options.js');

var parsedOptions = links.parse(window.location.search);
var viewOptions = L.extend(options.viewDefaults, parsedOptions);

var map = L.map('map', {
    zoomControl: false,
    dragging: false,
    scrollWheelZoom: false,
    touchZoom: false,
    doubleClickZoom: false
  }
  ).setView(viewOptions.center, viewOptions.zoom);

var mapbox = L.tileLayer('https://{s}.tiles.mapbox.com/v3/dennisl.4e2aab76/{z}/{x}/{y}.png',
    {attribution: '&copy; <a href="http://mapbox.com/">MapBox</a> &copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'}
    ).addTo(map);

var osrm = L.Routing.osrm();
var itinerary = L.Routing.itinerary({language: viewOptions.language});
var itineraryContainer = itinerary.onAdd();
document.getElementById("instructions").appendChild(itineraryContainer);

osrm.route(viewOptions.waypoints, function(error, alts) {
  var line = L.Routing.line(alts[0], {}),
      bounds,
      i;
  line.addTo(map);
  map.fitBounds(line.getBounds());

  viewOptions.waypoints.map(function (wp) {
    L.marker(wp.latLng).addTo(map);
  });
  itinerary.setAlternatives(alts);
}, null, {});

