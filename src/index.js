"use strict";

var mapbox = L.tileLayer('https://{s}.tiles.mapbox.com/v3/dennisl.4e2aab76/{z}/{x}/{y}.png');
var osm = L.tileLayer('http://{s}.tile.osm.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
    });

var map = L.map('map', {layers: [osm, mapbox]}).setView([51.505, -0.09], 8);

var baseMaps = {
  'OSM' : osm,
  'Mapbox': mapbox,
};

L.control.layers(baseMaps).addTo(map);

L.Routing.control({
    geocoder: L.Control.Geocoder.nominatim()
}).addTo(map);

