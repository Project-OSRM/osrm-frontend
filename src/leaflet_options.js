'use strict';

var L = require('leaflet');
const config = require('../config/config.json');

var layers = {};
var overlays = {};

// Load layers from config
for (let layer of config.layers) {
  layers[layer.name] = L.tileLayer(layer.url, {
    attribution: layer.attribution
  });
}

// Load overlays from config
for (let overlay of config.overlays) {
  overlays[overlay.name] = L.tileLayer(overlay.url, {
    attribution: overlay.attribution
  });
}

module.exports = {
  defaultState: {
    center: L.latLng(config.center[0], config.center[1]),
    zoom: config.zoom,
    waypoints: [],
    language: config.language,
    alternative: 0,
    layer: layers[config.layers[0].name], // Set the base layer to the first layer in the list
    service: 0
  },
  services: config.services,
  layer: [layers],
  overlay: overlays,
  baselayer: {
    one: layers[config.layers[0].name], // Set the base layer to the first layer in the list
  }
};
