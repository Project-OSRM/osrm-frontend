'use strict';

var L = require('leaflet');
var buildTimestamp = require('./version').buildTimestamp;
var runtimePromise;
// Resolve assets beside bundle.js, including deployments served from a subpath.
var scriptUrl = document.currentScript && document.currentScript.src;
var assetBase = scriptUrl || document.baseURI;

function loadRuntime() {
  if (runtimePromise) return runtimePromise;
  // The separately built adapter must share the app's Leaflet instance.
  window.L = L;
  runtimePromise = new Promise(function(resolve, reject) {
    var css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = new window.URL('vector.css?v=' + encodeURIComponent(buildTimestamp), assetBase).href;
    document.head.appendChild(css);
    var script = document.createElement('script');
    script.type = 'module';
    script.src = new window.URL('vector.js?v=' + encodeURIComponent(buildTimestamp), assetBase).href;
    function fail(error) {
      script.remove();
      css.remove();
      reject(error);
    }
    script.onload = function() {
      if (window.OSRMVector && typeof window.OSRMVector.createLayer === 'function') {
        resolve(window.OSRMVector);
      } else {
        fail(new Error('Vector map renderer did not load.'));
      }
    };
    script.onerror = function() {
      fail(new Error('Could not load the vector map renderer.'));
    };
    document.head.appendChild(script);
  }).catch(function(error) {
    runtimePromise = null;
    throw error;
  });
  return runtimePromise;
}

// Load the renderer only when selected. Keep the map's plain background until
// the vector style is ready; never fetch a raster basemap behind it.
function createLayer(style, options, runtimeLoader) {
  var VectorLayer = L.LayerGroup.extend({
    initialize: function() {
      L.LayerGroup.prototype.initialize.call(this);
      this.options = Object.assign({}, options);
    },
    getAttribution: function() {
      return this.options.attribution;
    },
    _showStatus: function(message, retry) {
      if (!this._status) {
        this._status = L.DomUtil.create('div', 'osrm-vector-status', this._map.getContainer());
        this._status.setAttribute('role', 'status');
        this._status.setAttribute('aria-live', 'polite');
        L.DomEvent.disableClickPropagation(this._status);
        L.DomEvent.disableScrollPropagation(this._status);
      }
      this._status.classList.toggle('osrm-vector-status-error', !!retry);
      this._status.replaceChildren();
      var text = L.DomUtil.create('span', '', this._status);
      var localization = require('./localization');
      text.textContent = localization.t(this.options.language || 'en', message);
      if (retry) {
        var button = L.DomUtil.create('button', '', this._status);
        button.type = 'button';
        button.textContent = localization.t(this.options.language || 'en', 'Try again');
        L.DomEvent.on(button, 'click', function(event) {
          L.DomEvent.stop(event);
          if (this._map) this._loadRenderer(this._map);
        }, this);
      }
    },
    _removeStatus: function() {
      if (this._status) this._status.remove();
      this._status = null;
    },
    _loadRenderer: function(map) {
      var generation = this._generation = (this._generation || 0) + 1;
      this.clearLayers();
      this._showStatus('Loading vector map…');
      var failed = function(error) {
        if (this._generation !== generation || this._map !== map) return;
        this.clearLayers();
        this._showStatus('Vector map could not load. Try again or choose another background.', true);
        this.fire('tileerror', { error: error });
      }.bind(this);
      (runtimeLoader || loadRuntime)().then(function(runtime) {
        if (this._generation !== generation || this._map !== map) return;
        try {
          var renderer = runtime.createLayer(style, this.options.theme || 'dark');
          this.addLayer(renderer);
          var loaded = false;
          renderer.getMaplibreMap().once('load', function() {
            if (this._generation !== generation || this._map !== map || !this.hasLayer(renderer)) return;
            loaded = true;
            this._removeStatus();
          }.bind(this));
          renderer.getMaplibreMap().on('error', function(event) {
            if (this._generation !== generation || this._map !== map) return;
            if (!loaded) failed(event.error);
            else this.fire('tileerror', { error: event.error });
          }.bind(this));
        } catch (error) {
          failed(error);
        }
      }.bind(this)).catch(failed);
    },
    onAdd: function(map) {
      map._addZoomLimit(this);
      L.LayerGroup.prototype.onAdd.call(this, map);
      this._loadRenderer(map);
    },
    onRemove: function(map) {
      this._generation++;
      L.LayerGroup.prototype.onRemove.call(this, map);
      this.clearLayers();
      this._removeStatus();
      map._removeZoomLimit(this);
    }
  });
  return new VectorLayer();
}

module.exports = { createLayer: createLayer };
