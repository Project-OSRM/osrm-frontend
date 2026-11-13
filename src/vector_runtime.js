import { MaplibreGL } from '@maplibre/maplibre-gl-leaflet';
import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';

setWorkerUrl(workerUrl);

// The adapter normally assumes that onAdd created a MapLibre map. WebGL can
// fail before that happens; removing the partially added layer must still work.
var BackgroundRenderer = MaplibreGL.extend({
  onRemove: function(map) {
    if (this.getMaplibreMap()) {
      MaplibreGL.prototype.onRemove.call(this, map);
    } else if (this.getContainer()) {
      this.getContainer().remove();
    }
  }
});

export function createLayer(style) {
  return new BackgroundRenderer({ style: style, interactive: false });
}

window.OSRMVector = { createLayer: createLayer };
