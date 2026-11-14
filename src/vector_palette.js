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

module.exports = { vectorStyle: vectorStyle, applyPalette: applyPalette };
