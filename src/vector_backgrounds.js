'use strict';

var L = require('leaflet');
var vectorLayers = require('./vector_layer');

// Layer-control entries share one live renderer. Leaflet removes the previous
// entry before adding the next; hide it after a handoff to another provider.
// Keep its WebGL map and loaded tiles until the Leaflet map itself is removed.
function createBackgrounds(style, options, runtimeLoader) {
  var background = vectorLayers.createLayer(style, options, runtimeLoader);
  var active;
  var currentMap;
  var satelliteStreetsEnabled = false;
  var refreshPending = false;
  var listeningMap;
  function refresh() {
    refreshPending = false;
    if (!currentMap) return;
    var satelliteActive = satelliteStreetsEnabled && options.satelliteLayer && currentMap.hasLayer(options.satelliteLayer);
    var theme = active ? active.options.theme : satelliteActive ? 'satellite' : null;
    if (!theme) {
      if (currentMap.hasLayer(background)) background.setVisible(false);
      return;
    }
    background.options.maxZoom = theme === 'satellite' ? options.satelliteLayer.options.maxZoom : options.maxZoom;
    if (background.options.theme !== theme) background.setTheme(theme);
    background.setVisible(true);
    if (!currentMap.hasLayer(background)) background.addTo(currentMap);
  }
  function scheduleRefresh() {
    if (refreshPending) return;
    refreshPending = true;
    Promise.resolve().then(refresh);
  }
  function satelliteChanged(event) {
    if (event.layer === options.satelliteLayer) scheduleRefresh();
  }
  function attach(map) {
    currentMap = map;
    if (listeningMap === map) return;
    listeningMap = map;
    map.on('layeradd layerremove', satelliteChanged);
    map.on('unload', function() {
      map.off('layeradd layerremove', satelliteChanged);
      currentMap = null;
      listeningMap = null;
      active = null;
      satelliteStreetsEnabled = false;
    });
  }
  var Variant = L.Layer.extend({
    initialize: function(variantOptions) {
      L.setOptions(this, variantOptions);
    },
    setLanguage: function(language) {
      background.setLanguage(language);
    },
    setRoutingProfile: function(profile) {
      background.setRoutingProfile(profile);
    },
    getAccessProperty: function() {
      return this._map ? background.getAccessProperty() : null;
    },
    getAttribution: function() {
      return ''; // Credits belong to the shared renderer, once.
    },
    onAdd: function(map) {
      active = this;
      attach(map);
      refresh();
    },
    onRemove: function(map) {
      if (active === this) active = null;
      scheduleRefresh();
    }
  });
  var SatelliteStreets = L.Layer.extend({
    options: { overlayBaseLayer: options.satelliteLayer },
    setLanguage: function(language) {
      background.setLanguage(language);
    },
    setRoutingProfile: function(profile) {
      background.setRoutingProfile(profile);
    },
    onAdd: function(map) {
      attach(map);
      satelliteStreetsEnabled = true;
      refresh();
    },
    onRemove: function() {
      satelliteStreetsEnabled = false;
      scheduleRefresh();
    }
  });
  return {
    vector: new Variant({ theme: options.theme || 'dark' }),
    streets: new Variant({ theme: 'original' }),
    satelliteStreets: new SatelliteStreets()
  };
}

module.exports = { createBackgrounds: createBackgrounds };
