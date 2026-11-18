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
  var getLanguage;
  var themeUpdatePending = false;
  var renderer = new BackgroundRenderer({
    style: style,
    interactive: false,
    transformStyle: function(previous, next) {
      var styleUrl = typeof style === 'string' ? new URL(style, document.baseURI).href : document.baseURI;
      original = vectorPalette.vectorStyle(resolveStyleAssets(next, styleUrl));
      renderedTheme = currentTheme;
      var themed = vectorPalette.styleForTheme(original, currentTheme);
      return vectorLabels.localizeStyle(themed, getLanguage());
    }
  });
  getLanguage = vectorLabels.configureRenderer(renderer, function() {
    return original;
  });
  var isBackgroundLoading = vectorPalette.configureLoadingBackground(renderer, function() {
    return original && vectorPalette.styleForTheme(original, currentTheme);
  });
  vectorAccess.configureRenderer(renderer);
  function updateLayerOrder() {
    var container = renderer.getContainer();
    if (container) container.style.zIndex = currentTheme === 'satellite' ? '100' : '';
  }
  renderer.on('add', function() {
    updateLayerOrder();
    vectorImages.registerVectorImages(renderer.getMaplibreMap());
  });
  renderer.setTheme = function(nextTheme) {
    if (currentTheme === nextTheme) return;
    currentTheme = nextTheme;
    updateLayerOrder();
    var map = renderer.getMaplibreMap();
    if (!original || !map) return;
    function apply() {
      themeUpdatePending = false;
      if (renderer.getMaplibreMap() !== map) return;
      vectorPalette.applyPalette(map, original, currentTheme, renderedTheme, isBackgroundLoading());
      renderedTheme = currentTheme;
    }
    if (map.isStyleLoaded() || original.layers.length && map.getLayer && map.getLayer(original.layers[0].id)) apply();
    else if (!themeUpdatePending) {
      themeUpdatePending = true;
      map.once('style.load', apply);
    }
  };
  return renderer;
}

window.OSRMVector = { createLayer: createLayer };
