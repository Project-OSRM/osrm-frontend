'use strict';

var vectorTheme = require('./vector_theme');

function vectorStyle(style) {
  var layers = style.layers.filter(function(layer) {
    return layer.type !== 'raster';
  });
  var sources = Object.assign({}, style.sources);
  Object.keys(sources).forEach(function(id) {
    if (sources[id].type === 'raster' && !layers.some(function(layer) {
      return layer.source === id;
    })) delete sources[id];
  });
  return Object.assign({}, style, { layers: layers, sources: sources });
}

// Leave features visible while the first view loads; clear only the background.
function transparentBackground(style) {
  return Object.assign({}, style, { layers: style.layers.map(function(layer) {
    if (layer.type !== 'background') return layer;
    return Object.assign({}, layer, { paint: Object.assign({}, layer.paint, { 'background-color': 'transparent' }) });
  }) });
}

function configureLoadingBackground(renderer) {
  var transformStyle = renderer.options.transformStyle;
  var backgrounds = [];
  var loading = true;
  renderer.options.transformStyle = function(previous, next) {
    var style = transformStyle(previous, next);
    backgrounds = style.layers.filter(function(layer) {
      return layer.type === 'background';
    });
    return loading ? transparentBackground(style) : style;
  };
  renderer.on('add', function() {
    var map = renderer.getMaplibreMap();
    map.once('load', function() {
      if (renderer.getMaplibreMap() !== map) return;
      loading = false;
      backgrounds.forEach(function(layer) {
        map.setPaintProperty(layer.id, 'background-color', layer.paint && layer.paint['background-color'] || null);
      });
    });
  });
  return function() {
    return loading;
  };
}

// Only paint changes: geometry, sources, sprites and label placement stay live.
function applyPalette(map, original, theme) {
  var dark = vectorTheme.transformStyle(null, original);
  var target = theme === 'original' ? original : dark;
  target.layers.forEach(function(layer, index) {
    var properties = Object.assign({}, original.layers[index].paint, dark.layers[index].paint);
    Object.keys(properties).forEach(function(property) {
      map.setPaintProperty(layer.id, property, layer.paint && layer.paint[property] !== undefined ? layer.paint[property] : null);
    });
  });
}

module.exports = { vectorStyle: vectorStyle, configureLoadingBackground: configureLoadingBackground, applyPalette: applyPalette };
