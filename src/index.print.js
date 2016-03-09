'use strict';

var LRM = require('leaflet-routing-machine');
var locate = require('leaflet.locatecontrol');
var links = require('./links');
var mapView = require('./leaflet_options');
var options = require('./lrm_options');
// var markerFactory = require('./marker');
var parsedOptions = links.parse(window.location.href);
var viewOptions = L.extend(mapView.defaultView, parsedOptions);

var map = L.map('map', {
  zoomControl: false,
  dragging: false,
  scrollWheelZoom: false,
  touchZoom: false,
  doubleClickZoom: false,
  layers: mapView.defaultView.layer,
  maxZoom: 18
}).setView(parsedOptions.center, viewOptions.zoom);

/* Setup markers */
function makeIcon(i, n) {
  var url = 'images/marker-icon-2x.png';
  var markerList = ['images/marker-start-icon-2x.png', 'images/marker-end-icon-2x.png'];
  if (i === 0) {
    return L.icon({
      iconUrl: markerList[0],
      iconSize: [20, 56],
      iconAnchor: [10, 28]
    });
  }
  if (i === n - 1) {
    return L.icon({
      iconUrl: markerList[1],
      iconSize: [20, 56],
      iconAnchor: [10, 28]
    });
  } else {
    return L.icon({
      iconUrl: url,
      iconSize: [20, 56],
      iconAnchor: [10, 28]
    });
  }
}

L.tileLayer('https://{s}.tiles.mapbox.com/v4/mapbox.streets/{z}/{x}/{y}@2x.png?access_token=pk.eyJ1IjoibXNsZWUiLCJhIjoiclpiTWV5SSJ9.P_h8r37vD8jpIH1A6i1VRg', {
  attribution: 'Maps by <a href="https://www.mapbox.com/about/maps/">Mapbox</a>. ' +
    'Routes from <a href="http://project-osrm.org/">OSRM</a>, ' +
    'data uses <a href="http://opendatacommons.org/licenses/odbl/">ODbL</a> license'
}).addTo(map);

var osrm = L.Routing.osrm();
var itinerary = L.Routing.itinerary({
  language: viewOptions.language
});
var itineraryContainer = itinerary.onAdd(map);
document.getElementById("instructions").appendChild(itineraryContainer);

osrm.route(viewOptions.waypoints, function(error, alts) {
  var altIdx = viewOptions.alternative ? viewOptions.alternative : 0;
  var lineOptions = options.lrm.lineOptions;
  var line = L.Routing.line(alts[alts.length - 1], lineOptions);
  line.addTo(map);
  map.fitBounds(line.getBounds());

  viewOptions.waypoints.map(function(currentVal, i, n) {
    var options = {
      icon: makeIcon(currentVal, n.length)
    };
    var colorMarkers = L.marker(currentVal.latLng, options);
    colorMarkers.addTo(map);
  });
  itinerary.setAlternatives(alts);
  itinerary.selectAlternative(altIdx);
});