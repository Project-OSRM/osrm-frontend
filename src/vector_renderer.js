'use strict';

var vectorAttribution = require('./vector_attribution');

function createBackgroundRenderer(MaplibreGL) {
  return MaplibreGL.extend({
    _updateVisibility: function() {
      var container = this.getContainer();
      if (container) container.style.visibility = this._suspended || this._loading ? 'hidden' : '';
    },

    _initContainer: function() {
      MaplibreGL.prototype._initContainer.call(this);
      this._updateVisibility();
    },

    onAdd: function(map) {
      this._loading = true;
      this._updateVisibility();
      MaplibreGL.prototype.onAdd.call(this, map);
      var gl = this.getMaplibreMap();
      gl.once('load', function() {
        if (this._map !== map || this.getMaplibreMap() !== gl) return;
        this._loading = false;
        this._updateVisibility();
      }.bind(this));
    },

    setVisible: function(visible) {
      if (this._suspended === !visible) return;
      var map = this._map;
      var attribution = map && map.attributionControl;
      if (attribution) attribution.removeAttribution(this.getAttribution());
      this._suspended = !visible;
      this._updateVisibility();
      var gl = this.getMaplibreMap();
      if (visible && gl && map) {
        this._resizeContainer();
        gl.resize();
        this._zoomEnd();
        gl.redraw();
      }
      if (attribution) attribution.addAttribution(this.getAttribution());
    },

    getEvents: function() {
      var events = MaplibreGL.prototype.getEvents.call(this);
      Object.keys(events).forEach(function(name) {
        var handler = events[name];
        events[name] = function(event) {
          if (!this._suspended) handler.call(this, event);
        };
      });
      return events;
    },

    _update: function(event) {
      if (!this._suspended) MaplibreGL.prototype._update.call(this, event);
    },

    _transitionEnd: function(event) {
      if (!this._suspended) MaplibreGL.prototype._transitionEnd.call(this, event);
    },

    getAttribution: function() {
      if (this._suspended) return '';
      return vectorAttribution(this.getMaplibreMap(), this.options && this.options.additionalAttribution);
    },

    _pinchZoom: function(event) {
      if (this._suspended) return;
      MaplibreGL.prototype._pinchZoom.call(this, event);
      // jumpTo normally queues a separate animation frame. Draw now during
      // our frame-driven zoom so the background and Leaflet overlays agree.
      if (event && event.smoothWheel) this.getMaplibreMap().redraw();
    },

    // WebGL can fail before onAdd creates a MapLibre map. Removing that
    // partially added layer must still work so loading can be retried safely.
    onRemove: function(map) {
      if (this.getMaplibreMap()) {
        MaplibreGL.prototype.onRemove.call(this, map);
      } else if (this.getContainer()) {
        this.getContainer().remove();
      }
    }
  });
}

module.exports = createBackgroundRenderer;
