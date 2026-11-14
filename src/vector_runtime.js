import { MaplibreGL } from '@maplibre/maplibre-gl-leaflet';
import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import createBackgroundRenderer from './vector_renderer';
import vectorTheme from './vector_theme';
import vectorPalette from './vector_palette';

setWorkerUrl(workerUrl);

var BackgroundRenderer = createBackgroundRenderer(MaplibreGL);

export function createLayer(style, theme) {
  var original;
  var currentTheme = theme;
  var renderer = new BackgroundRenderer({
    style: style,
    interactive: false,
    transformStyle: function(previous, next) {
      original = vectorPalette.vectorStyle(next);
      return currentTheme === 'original' ? original : vectorTheme.transformStyle(previous, original);
    }
  });
  renderer.setTheme = function(nextTheme) {
    if (currentTheme === nextTheme) return;
    currentTheme = nextTheme;
    var map = renderer.getMaplibreMap();
    if (!original || !map) return;
    function apply() {
      vectorPalette.applyPalette(map, original, currentTheme);
    }
    if (map.isStyleLoaded()) apply();
    else map.once('load', apply);
  };
  return renderer;
}

window.OSRMVector = { createLayer: createLayer };
