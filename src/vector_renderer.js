'use strict';

function createBackgroundRenderer(MaplibreGL) {
  return MaplibreGL.extend({
    _pinchZoom: function(event) {
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
