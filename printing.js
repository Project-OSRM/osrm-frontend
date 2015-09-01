'use strict';
/* global L */

var LRM = require('leaflet-routing-machine');
var links = require('./src/links');
var mapView = require('./src/leaflet_options');
var options = require('./src/lrm_options');

var parsedOptions = links.parse(window.location.hash);
var viewOptions = L.extend(mapView.defaultView, parsedOptions);

var map = L.map('map', {
    zoomControl: false,
    dragging: false,
    scrollWheelZoom: false,
    touchZoom: false,
    doubleClickZoom: false,  
    layers: mapView.defaultView.layer,
    maxZoom: 18
  }
).setView(parsedOptions.center, viewOptions.zoom);

/* Setup markers */
function makeIcon(i, n) {
  var url = 'images/marker-via-icon-2x.png';
  var markerList = ['images/marker-start-icon-2x.png', 'images/marker-end-icon-2x.png'];
  if (i === 0) {
    return L.icon({
      iconUrl: markerList[0],
      iconSize: [25, 41]
    });
  } if (i === n - 1) {
    return L.icon({
      iconUrl: markerList[1],
      iconSize: [25, 41]
    });
  } else {
    return L.icon({
      iconUrl: url,
      iconSize: [25, 41]
    });
  }
}

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
  var lineOptions = options.lrm.lineOptions;
  var line = L.Routing.line(alts[alts.length - 1], lineOptions);
  line.addTo(map);
  map.fitBounds(line.getBounds());
});

// add markers here
viewOptions.waypoints.map(function (currentVal, i, n) {
  var options = { icon: makeIcon(currentVal, n.length) };
  var colorMarkers = L.marker(i.latLng, options);
  colorMarkers.addTo(map);
  itinerary.setAlternatives(alts);
});




