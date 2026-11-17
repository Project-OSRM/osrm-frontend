import { MaplibreGL } from '@maplibre/maplibre-gl-leaflet';
import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import createBackgroundRenderer from './vector_renderer';
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
  var renderedTheme = theme;
  var currentLanguage = 'en';
  var languageUpdatePending = false;
  var renderer = new BackgroundRenderer({
    style: style,
    interactive: false,
    transformStyle: function(previous, next) {
      var styleUrl = typeof style === 'string' ? new URL(style, document.baseURI).href : document.baseURI;
      original = vectorPalette.vectorStyle(resolveStyleAssets(next, styleUrl));
      renderedTheme = currentTheme;
      var themed = vectorPalette.styleForTheme(original, currentTheme);
      return vectorLabels.localizeStyle(themed, currentLanguage);
    }
  });
  var isBackgroundLoading = vectorPalette.configureLoadingBackground(renderer);
  vectorAccess.configureRenderer(renderer);
  function updateLayerOrder() {
    var container = renderer.getContainer();
    if (container) container.style.zIndex = currentTheme === 'satellite' ? '100' : '';
  }
  renderer.on('add', function() {
    updateLayerOrder();
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
    updateLayerOrder();
    var map = renderer.getMaplibreMap();
    if (!original || !map) return;
    function apply() {
      if (renderer.getMaplibreMap() !== map) return;
      vectorPalette.applyPalette(map, original, currentTheme, renderedTheme);
      renderedTheme = currentTheme;
    }
    if (!isBackgroundLoading() && map.isStyleLoaded()) apply();
    else map.once('load', apply);
  };
  return renderer;
}

window.OSRMVector = { createLayer: createLayer };
