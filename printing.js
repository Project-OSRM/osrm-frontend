'use strict';
/* global L */

var LRM = require('leaflet-routing-machine');
var links = require('./src/links');
var mapView = require('./src/leaflet_options');

var parsedOptions = links.parse(window.location.hash);
var viewOptions = L.extend(mapView.defaultView, parsedOptions);

var map = L.map('map', {
    zoomControl: false,
    dragging: false,
    scrollWheelZoom: false,
    touchZoom: false,
    doubleClickZoom: false
  }
  ).setView(parsedOptions.center, viewOptions.zoom);

L.tileLayer('https://{s}.tiles.mapbox.com/v4/'+mapView.defaultView.layer+'/{z}/{x}/{y}@2x.png?access_token=pk.eyJ1IjoibXNsZWUiLCJhIjoiclpiTWV5SSJ9.P_h8r37vD8jpIH1A6i1VRg', {
	attribution: 'Maps by <a href="https://www.mapbox.com/about/maps/">Mapbox</a>. ' +
		'Routes from <a href="http://project-osrm.org/">OSRM</a>, ' +
		'data uses <a href="http://opendatacommons.org/licenses/odbl/">ODbL</a> license'
}).addTo(map);

var osrm = L.Routing.osrm();
var itinerary = L.Routing.itinerary({language: viewOptions.language});
var itineraryContainer = itinerary.onAdd(map);

document.getElementById("instructions").appendChild(itineraryContainer);

osrm.route(viewOptions.waypoints, function(error, alts) {
  var line = L.Routing.line(alts[alts.length - 1], {});

  line.addTo(map);
  map.fitBounds(line.getBounds());

  viewOptions.waypoints.map(function (wp) {
    L.marker(wp.latLng).addTo(map);
  });

  itinerary.setAlternatives(alts);
}, null, {});
