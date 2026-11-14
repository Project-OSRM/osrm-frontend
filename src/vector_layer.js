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

// Load the renderer only when selected. A raster layer remains underneath until
// the vector style finishes loading, and stays usable if WebGL or loading fails.
function createLayer(style, options, runtimeLoader) {
  var VectorLayer = L.LayerGroup.extend({
    initialize: function() {
      L.LayerGroup.prototype.initialize.call(this);
      this.options = Object.assign({}, options);
    },
    getAttribution: function() {
      return this.options.attribution;
    },
    onAdd: function(map) {
      map._addZoomLimit(this);
      L.LayerGroup.prototype.onAdd.call(this, map);
      var generation = this._generation = (this._generation || 0) + 1;
      var fallback = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        minZoom: 1,
        maxZoom: 22,
        maxNativeZoom: 19
      });
      this.addLayer(fallback);
      (runtimeLoader || loadRuntime)().then(function(runtime) {
        if (this._generation !== generation || this._map !== map) return;
        var renderer;
        try {
          renderer = runtime.createLayer(style, this.options.theme || 'dark');
          this.addLayer(renderer);
          renderer.getMaplibreMap().once('load', function() {
            if (this._generation === generation && this.hasLayer(renderer) && this.hasLayer(fallback)) this.removeLayer(fallback);
          }.bind(this));
          renderer.getMaplibreMap().on('error', function(event) {
            if (this.hasLayer(fallback) && this.hasLayer(renderer)) this.removeLayer(renderer);
            this.fire('tileerror', { error: event.error });
          }.bind(this));
        } catch (error) {
          if (renderer && this.hasLayer(renderer)) this.removeLayer(renderer);
          this.fire('tileerror', { error: error });
        }
      }.bind(this)).catch(function(error) {
        if (this._generation === generation) this.fire('tileerror', { error: error });
      }.bind(this));
    },
    onRemove: function(map) {
      this._generation++;
      L.LayerGroup.prototype.onRemove.call(this, map);
      this.clearLayers();
      map._removeZoomLimit(this);
    }
  });
  return new VectorLayer();
}

module.exports = { createLayer: createLayer };
