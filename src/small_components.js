'use strict';

var L = require('leaflet');
var componentTiles = require('./component_tiles');
var vectorLayers = require('./vector_layer');
var localization = require('./localization');

function createLayer(runtimeLoader) {
  var Components = L.LayerGroup.extend({
    initialize: function() {
      L.LayerGroup.prototype.initialize.call(this);
      this._language = 'en';
    },
    setService: function(service) {
      var url = componentTiles.tileTemplate(service);
      if (this._tileUrl === url) return;
      this._tileUrl = url;
      this.clearLayers();
      this._renderer = null;
      if (this._map) this._refresh();
    },
    setLanguage: function(language) {
      this._language = language;
      if (this._renderer) this._renderer.setLanguage(language);
      if (this._map) this._refresh();
    },
    // The adapter uses MapLibre zoom = Leaflet zoom - 1. OSRM starts at tile z12.
    _refresh: function() {
      this._removeStatus();
      var message = !this._tileUrl ? 'Small Components unavailable for this routing mode.' :
        this._map.getZoom() < 13 ? 'Zoom in to level 13 to see small routing components.' : null;
      if (message) {
        this._status = L.DomUtil.create('div', 'osrm-vector-status osrm-components-status', this._map.getContainer());
        this._status.setAttribute('role', 'status');
        this._status.textContent = localization.t(this._language, message);
        L.DomEvent.disableClickPropagation(this._status);
        L.DomEvent.disableScrollPropagation(this._status);
      }
      if (this._tileUrl && !this._renderer && this._map.getZoom() >= 13) {
        this._renderer = vectorLayers.createLayer(componentTiles.componentStyle(this._tileUrl), {
          theme: 'original', overlay: true, pane: 'componentsPane', language: this._language,
          loadingMessage: 'Loading small routing components…',
          errorMessage: 'Small Components unavailable for this routing mode.'
        }, runtimeLoader);
        this.addLayer(this._renderer);
      }
    },
    _removeStatus: function() {
      if (this._status) this._status.remove();
      this._status = null;
    },
    onAdd: function(map) {
      if (!map.getPane('componentsPane')) map.createPane('componentsPane').style.zIndex = 350;
      L.LayerGroup.prototype.onAdd.call(this, map);
      map.on('zoomend', this._refresh, this);
      this._refresh();
    },
    onRemove: function(map) {
      map.off('zoomend', this._refresh, this);
      L.LayerGroup.prototype.onRemove.call(this, map);
      this.clearLayers();
      this._renderer = null;
      this._removeStatus();
    }
  });
  return new Components();
}

module.exports = { createLayer: createLayer };
