'use strict';

var L = require('leaflet');

var ClickLayersControl = L.Control.Layers.extend({
  onAdd: function(map) {
    var container = L.Control.Layers.prototype.onAdd.call(this, map);
    // Hover expansion puts the first radio button under a click aimed at the
    // icon. Keep the existing click and keyboard handlers instead.
    L.DomEvent.off(container, 'mouseenter', this._expandSafely, this);
    return container;
  }
});

module.exports = function(baseLayers, overlays, options) {
  return new ClickLayersControl(baseLayers, overlays, options);
};
