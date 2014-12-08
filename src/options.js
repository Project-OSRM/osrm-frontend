"use strict";

var defaultView = {
  center: L.latLng(48.84, 10.10),
  zoom: 5,
  waypoints: [],
  language: 'en',
  service: 'Car (fastest)',
  layer: 'OSRM bright',
};

var defaultControl = {
  geocoder: L.Control.Geocoder.nominatim(),
  routeWhileDragging: true,
  routeDragInterval: 2,
  addWaypoints: false,
  waypointMode: 'snap',
};

var services = {
 'Car (fastest)': '//router.project-osrm.org/viaroute'
};

var layers = {
  'OSRM bright': L.tileLayer('https://{s}.tiles.mapbox.com/v3/dennisl.4e2aab76/{z}/{x}/{y}.png',
  {
    attribution:'<a href="https://www.mapbox.com/about/maps">© Mapbox</a> <a href="http://openstreetmap.org/copyright">© OpenStreetMap</a> | <a href="http://mapbox.com/map-feedback/">Improve this map</a>',
    maxZoom: 18
  }),
  'Mapbox Terrain': L.tileLayer('https://{s}.tiles.mapbox.com/v3/dennisl.map-dfbkqsr2/{z}/{x}/{y}.png',
  {
    attribution:'<a href="https://www.mapbox.com/about/maps">© Mapbox</a> <a href="http://openstreetmap.org/copyright">© OpenStreetMap</a> | <a href="http://mapbox.com/map-feedback/">Improve this map</a>',
    maxZoom: 18
  }),

  'Mapbox Labelled Satellite': L.tileLayer('https://{s}.tiles.mapbox.com/v3/dennisl.map-6g3jtnzm/{z}/{x}/{y}.png',
  {
    attribution: '<a href="https://www.mapbox.com/about/maps">© Mapbox</a> <a href="http://openstreetmap.org/copyright">© OpenStreetMap</a> | <a href="http://mapbox.com/map-feedback/">Improve this map</a>',
    maxZoom: 18
  }),
  'Mapbox Satellite': L.tileLayer('https://{s}.tiles.mapbox.com/v3/dennisl.map-inp5al1s/{z}/{x}/{y}.png',
  {
    attribution: '<a href="https://www.mapbox.com/about/maps">© Mapbox</a> <a href="http://openstreetmap.org/copyright">© OpenStreetMap</a> | <a href="http://mapbox.com/map-feedback/">Improve this map</a>',
    maxZoom: 18
  }),
  'osm.org': L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  {
    attribution: '© <a href="http://www.openstreetmap.org/copyright/en">OpenStreetMap</a> contributors',
    maxZoom: 18
  }),
  'osm.de': L.tileLayer('http://{s}.tile.openstreetmap.de/tiles/osmde/{z}/{x}/{y}.png',
  {
    attribution: '© <a href="http://www.openstreetmap.org/copyright/en">OpenStreetMap</a> contributors',
    maxZoom: 18
  }),
  'MapQuest': L.tileLayer('http://otile{s}.mqcdn.com/tiles/1.0.0/osm/{z}/{x}/{y}.png',
  {
      attribution:'© <a href="http://www.openstreetmap.org/copyright/en">OpenStreetMap</a> contributors, Imagery © <a href="http://www.mapquest.de/">MapQuest</a>',
      maxZoom: 18,
      subdomains: '1234'
  })
};

module.exports = {
  viewDefaults: defaultView,
  controlDefaults: defaultControl,
  layers: layers,
  services: services,
};
