import { MaplibreGL } from '@maplibre/maplibre-gl-leaflet';
import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import createBackgroundRenderer from './vector_renderer';
import vectorTheme from './vector_theme';
import vectorPalette from './vector_palette';
import resolveStyleAssets from './vector_style_assets';
import vectorImages from './vector_images';
import vectorAccess from './vector_access';
import vectorLabels from './vector_labels';

setWorkerUrl(workerUrl);

var BackgroundRenderer = createBackgroundRenderer(MaplibreGL);

export function createLayer(style, theme) {
  var original;
  var currentTheme = theme;
  var currentLanguage = 'en';
  var languageUpdatePending = false;
  var renderer = new BackgroundRenderer({
    style: style,
    interactive: false,
    transformStyle: function(previous, next) {
      var styleUrl = typeof style === 'string' ? new URL(style, document.baseURI).href : document.baseURI;
      original = vectorPalette.vectorStyle(resolveStyleAssets(next, styleUrl));
      var themed = currentTheme === 'original' ? original : vectorTheme.transformStyle(previous, original);
      return vectorLabels.localizeStyle(themed, currentLanguage);
    }
  });
  var isBackgroundLoading = vectorPalette.configureLoadingBackground(renderer);
  vectorAccess.configureRenderer(renderer);
  renderer.on('add', function() {
    vectorImages.registerVectorImages(renderer.getMaplibreMap());
  });
  renderer.setLanguage = function(nextLanguage) {
    nextLanguage = nextLanguage || 'en';
    if (currentLanguage === nextLanguage) return;
    currentLanguage = nextLanguage;
    var map = renderer.getMaplibreMap();
    if (!original || !map) return;
    function apply() {
      languageUpdatePending = false;
      if (renderer.getMaplibreMap() === map) vectorLabels.applyLanguage(map, original, currentLanguage);
    }
    if (map.isStyleLoaded()) apply();
    else if (!languageUpdatePending) {
      languageUpdatePending = true;
      map.once('load', apply);
    }
  };
  renderer.setTheme = function(nextTheme) {
    if (currentTheme === nextTheme) return;
    currentTheme = nextTheme;
    var map = renderer.getMaplibreMap();
    if (!original || !map) return;
    function apply() {
      vectorPalette.applyPalette(map, original, currentTheme);
    }
    if (!isBackgroundLoading() && map.isStyleLoaded()) apply();
    else map.once('load', apply);
  };
  return renderer;
}

window.OSRMVector = { createLayer: createLayer };
