'use strict';

var palette = {
  background: '#303e50',
  water: '#24575d',
  forest: '#28504e',
  park: '#345e52',
  grass: '#3a6155',
  building: '#3b495d',
  buildingOutline: '#48576c',
  street: '#5e7088',
  mainRoad: '#8395ad',
  roadCasing: '#29394b',
  text: '#d5dfe7',
  mutedText: '#a8bacb',
  halo: '#2a3948'
};

function fillColor(name) {
  if (/water|ocean|lake/.test(name)) return palette.water;
  if (/wood|forest/.test(name)) return palette.forest;
  if (/park|pitch|cemetery|garden/.test(name)) return palette.park;
  if (/grass|wetland|landcover/.test(name)) return palette.grass;
  if (/building/.test(name)) return palette.building;
  if (/sand|beach/.test(name)) return '#655f50';
  if (/hospital/.test(name)) return '#444453';
  return palette.background;
}

function lineColor(name) {
  if (/water|river|stream/.test(name)) return '#2d6970';
  if (/casing/.test(name)) return palette.roadCasing;
  if (/motorway|trunk|primary/.test(name)) return palette.mainRoad;
  if (/boundary/.test(name)) return '#66788a';
  if (/rail|aeroway/.test(name)) return '#56677b';
  return palette.street;
}

// Recolor the loaded style before its first frame. Geometry, label placement,
// filters, fonts, sprites, source URLs and provider attribution stay intact.
function transformStyle(previousStyle, style) {
  var layers = (style.layers || []).filter(function(layer) {
    return layer.type !== 'raster';
  }).map(function(layer) {
    var copy = Object.assign({}, layer);
    var paint = copy.paint = Object.assign({}, layer.paint);
    var name = (layer.id + ' ' + (layer['source-layer'] || '')).toLowerCase();
    if (layer.type === 'background') paint['background-color'] = palette.background;
    if (layer.type === 'fill') {
      delete paint['fill-pattern'];
      paint['fill-color'] = fillColor(name);
      if (paint['fill-outline-color']) paint['fill-outline-color'] = /building/.test(name) ? palette.buildingOutline : fillColor(name);
    }
    if (layer.type === 'fill-extrusion') paint['fill-extrusion-color'] = palette.building;
    if (layer.type === 'line') paint['line-color'] = lineColor(name);
    if (layer.type === 'symbol' && layer.layout && layer.layout['text-field']) {
      paint['text-color'] = /shield/.test(name) ? '#243444' :
        /water/.test(name) ? '#86b5c5' : /transportation|highway/.test(name) ? palette.mutedText : palette.text;
      if (/poi/.test(name)) {
        paint['text-color'] = ['match', ['get', 'class'],
          ['park', 'garden', 'playground'], '#a0c59b',
          ['restaurant', 'cafe', 'bar', 'fast_food'], '#d4af8e',
          ['school', 'college', 'university'], '#c0af9b',
          palette.mutedText];
      }
      paint['text-halo-color'] = palette.halo;
      paint['text-halo-width'] = 1.25;
      paint['text-halo-blur'] = 0.4;
    }
    if (layer.type === 'hillshade') {
      paint['hillshade-shadow-color'] = '#163c42';
      paint['hillshade-highlight-color'] = '#557368';
      paint['hillshade-accent-color'] = '#294a4d';
    }
    return copy;
  });
  var sources = Object.assign({}, style.sources);
  Object.keys(sources).forEach(function(key) {
    if (sources[key].type === 'raster' && !layers.some(function(layer) {
      return layer.source === key;
    })) delete sources[key];
  });
  return Object.assign({}, style, { sources: sources, layers: layers });
}

module.exports = { palette: palette, transformStyle: transformStyle };
