/**
 * @jest-environment jsdom
 */
'use strict';

var L = require('leaflet');
var createHandler = require('../src/location_handler');

test('locationfound zooms to z14 when no route exists', () => {
  document.body.innerHTML = '<div id="map" style="width:800px;height:600px"></div>';
  var map = L.map('map', {center: [0,0], zoom: 10});
  var lrmControl = {_routes: [], _selectedRoute: undefined};
  var handler = createHandler(map, lrmControl);
  map.on('locationfound', handler);
  map.fire('locationfound', {latlng: L.latLng(50, 8)});
  expect(map.getZoom()).toBe(14);
  expect(map.getCenter().lat).toBeCloseTo(50, 5);
});

test('locationfound does not change zoom when route exists', () => {
  document.body.innerHTML = '<div id="map" style="width:800px;height:600px"></div>';
  var map = L.map('map', {center: [0,0], zoom: 11});
  var lrmControl = {_routes: [{}, {}], _selectedRoute: 0};
  var handler = createHandler(map, lrmControl);
  map.on('locationfound', handler);
  map.fire('locationfound', {latlng: L.latLng(51, 9)});
  expect(map.getZoom()).toBe(11);
});