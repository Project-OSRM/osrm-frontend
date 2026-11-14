import { MaplibreGL } from '@maplibre/maplibre-gl-leaflet';
import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import createBackgroundRenderer from './vector_renderer';

setWorkerUrl(workerUrl);

var BackgroundRenderer = createBackgroundRenderer(MaplibreGL);

export function createLayer(style) {
  return new BackgroundRenderer({ style: style, interactive: false });
}

window.OSRMVector = { createLayer: createLayer };
