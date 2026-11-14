'use strict';

var L = require('leaflet');
var vectorLayers = require('./vector_layer');

// Layer-control entries share one live renderer. Leaflet removes the previous
// entry before adding the next; defer cleanup until that handoff completes.
function createBackgrounds(style, options, runtimeLoader) {
  var background = vectorLayers.createLayer(style, options, runtimeLoader);
  var active;
  var currentMap;
  var Variant = L.Layer.extend({
    initialize: function(variantOptions) {
      L.setOptions(this, variantOptions);
    },
    getAttribution: function() {
      return ''; // Credits belong to the shared renderer, once.
    },
    onAdd: function(map) {
      active = this;
      currentMap = map;
      background.setTheme(this.options.theme);
      if (!map.hasLayer(background)) background.addTo(map);
    },
    onRemove: function(map) {
      if (active === this) active = null;
      Promise.resolve().then(function() {
        if (!active && currentMap === map) {
          map.removeLayer(background);
          currentMap = null;
        }
      });
    }
  });
  return {
    vector: new Variant({ theme: options.theme || 'dark' }),
    streets: new Variant({ theme: 'original' })
  };
}

module.exports = { createBackgrounds: createBackgrounds };
