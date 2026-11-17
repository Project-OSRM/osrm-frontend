'use strict';

var vectorTheme = require('./vector_theme');
var vectorSatellite = require('./vector_satellite');

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

function configureLoadingBackground(renderer, currentStyle) {
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
      var readyStyle = currentStyle && currentStyle();
      var readyBackgrounds = readyStyle ? readyStyle.layers.filter(function(layer) {
        return layer.type === 'background';
      }) : backgrounds;
      readyBackgrounds.forEach(function(layer) {
        map.setPaintProperty(layer.id, 'background-color', layer.paint && layer.paint['background-color'] || null);
      });
    });
  });
  return function() {
    return loading;
  };
}

function styleForTheme(original, theme) {
  if (theme === 'original') return original;
  if (theme === 'satellite') return vectorSatellite.transformStyle(original);
  return vectorTheme.transformStyle(null, original);
}

// Paint and optional overlay visibility changes retain the sources and geometry.
function applyPalette(map, original, theme, previousTheme, loading) {
  var dark = vectorTheme.transformStyle(null, original);
  var satellite = theme === 'satellite' || previousTheme === 'satellite' ? vectorSatellite.transformStyle(original) : null;
  var target = theme === 'original' ? original : theme === 'satellite' ? satellite : dark;
  target.layers.forEach(function(layer, index) {
    var properties = Object.assign({}, original.layers[index].paint, dark.layers[index].paint, satellite && satellite.layers[index].paint);
    Object.keys(properties).forEach(function(property) {
      var value = layer.paint && layer.paint[property] !== undefined ? layer.paint[property] : null;
      if (loading && layer.type === 'background' && property === 'background-color') value = 'transparent';
      map.setPaintProperty(layer.id, property, value);
    });
    if (satellite) {
      var initial = original.layers[index].layout && original.layers[index].layout.visibility;
      if ((satellite.layers[index].layout && satellite.layers[index].layout.visibility) !== initial) {
        map.setLayoutProperty(layer.id, 'visibility', layer.layout && layer.layout.visibility || null);
      }
    }
  });
}

module.exports = { vectorStyle: vectorStyle, configureLoadingBackground: configureLoadingBackground, styleForTheme: styleForTheme, applyPalette: applyPalette };
