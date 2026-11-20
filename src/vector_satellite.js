'use strict';

var vectorTheme = require('./vector_theme');
var labelSources = ['street_labels', 'street_labels_points', 'streets_polygons_labels', 'place_labels', 'boundary_labels', 'addresses'];

function scaledOpacity(value, factor) {
  if (value === undefined) return factor;
  if (typeof value === 'number') return value * factor;
  if (value.stops) {
    return Object.assign({}, value, { stops: value.stops.map(function(stop) {
      return [stop[0], scaledOpacity(stop[1], factor)];
    }) });
  }
  if (Array.isArray(value) && (value[0] === 'interpolate' || value[0] === 'step')) {
    return value.map(function(item, index) {
      return index >= (value[0] === 'step' ? 2 : 4) && index % 2 === 0 ? scaledOpacity(item, factor) : item;
    });
  }
  return ['*', value, factor];
}

function transformStyle(style) {
  var dark = vectorTheme.transformStyle(null, style);
  return Object.assign({}, dark, { layers: dark.layers.map(function(layer) {
    var copy = Object.assign({}, layer);
    var paint = copy.paint = Object.assign({}, layer.paint);
    var source = layer['source-layer'];
    var road = layer.type === 'line' && source === 'streets';
    var label = layer.type === 'symbol' && (labelSources.indexOf(source) !== -1 || source === 'streets');
    var pedestrian = layer.type === 'fill' && source === 'street_polygons' && /pedestrian-zone/.test(layer.id);
    if (!road && !label && !pedestrian) {
      copy.layout = Object.assign({}, layer.layout, { visibility: 'none' });
    }
    if (layer.type === 'background') paint['background-opacity'] = 0;
    if (road) {
      var casing = /outline|casing/.test(layer.id);
      var major = /motorway|trunk|primary/.test(layer.id);
      var rail = /rail/.test(layer.id);
      if (!/^road-access-/.test(layer.id)) {
        paint['line-color'] = casing ? '#15232f' : major ? '#ffe3a0' : rail ? '#bdc7d1' : '#d1e4f0';
        paint['line-opacity'] = scaledOpacity(paint['line-opacity'], casing ? 0.5 : rail ? 0.4 : 0.6);
      }
    }
    if (pedestrian) {
      paint['fill-color'] = '#c9e0ed';
      paint['fill-opacity'] = scaledOpacity(paint['fill-opacity'], 0.2);
    }
    if (label && !/shield/.test(layer.id)) {
      if (layer.layout && layer.layout['text-field']) {
        paint['text-color'] = '#f1f5f8';
        paint['text-halo-color'] = '#16232ee6';
        paint['text-halo-width'] = 1.5;
        paint['text-halo-blur'] = 0.3;
      }
      if (layer.layout && layer.layout['icon-image']) paint['icon-color'] = '#e2edf3';
    }
    return copy;
  }) });
}

module.exports = { transformStyle: transformStyle };
