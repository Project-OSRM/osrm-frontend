'use strict';

var palette = {
  background: '#303e50',
  water: '#3d6489',
  waterway: '#6ca5d0',
  waterShadow: '#315474',
  forest: '#345c48',
  park: '#456e52',
  grass: '#50755a',
  farmland: '#4c6a4b',
  orchard: '#41684f',
  residential: '#344355',
  pavement: '#858e99',
  buildingBase: '#344356',
  building: '#3e4e62',
  buildingOutline: '#46586b',
  street: '#5e7088',
  walkingPath: '#788695',
  mainRoad: '#8395ad',
  highway: '#91a4bb',
  secondaryRoad: '#71859a',
  roadCasing: '#29394b',
  text: '#d5dfe7',
  mutedText: '#a8bacb',
  halo: '#2a3948'
};

var pavedAirportKinds = ['apron', 'runway', 'taxiway'];
var agriculturalKinds = ['farmland', 'farm', 'agriculture', 'cropland', 'crop', 'orchard', 'vineyard', 'plantation'];

function fillColor(name, id) {
  if (/^landcover(?:_|$)/.test(id) || id === 'landuse') {
    return ['match', ['coalesce', ['get', 'kind'], ['get', 'class'], ''],
      ['wood', 'forest'], palette.forest,
      ['park', 'garden', 'recreation_ground', 'village_green', 'golf_course', 'cemetery', 'stadium'], palette.park,
      ['grass', 'grassland', 'meadow', 'allotments'], palette.grass,
      ['farmland', 'farm', 'agriculture', 'cropland', 'crop'], palette.farmland,
      ['orchard', 'vineyard', 'plantation'], palette.orchard,
      ['scrub', 'heath'], '#48664e',
      pavedAirportKinds, palette.pavement,
      ['industrial', 'commercial'], '#394554',
      palette.background];
  }
  if (/airport|apron|runway|taxiway/.test(name)) return palette.pavement;
  if (/orchard|vineyard|plantation/.test(name)) return palette.orchard;
  if (/farmland|agricultur|cropland|farm/.test(name)) return palette.farmland;
  if (/residential/.test(name)) return palette.residential;
  if (/water_shadow/.test(name)) return palette.waterShadow;
  if (/water|ocean|lake/.test(name)) return palette.water;
  if (/wood|forest/.test(name)) return palette.forest;
  if (/park|pitch|cemetery|garden|burial|leisure|sports-centre/.test(name)) return palette.park;
  if (/grass|wetland|vegetation|landcover/.test(name)) return palette.grass;
  if (/building/.test(name)) return /(?:top|roof)/.test(name) ? palette.building : palette.buildingBase;
  if (/bridge|pier|pedestrian-zone/.test(name)) return palette.street;
  if (/sand|beach|rock/.test(name)) return '#655f50';
  if (/hospital/.test(name)) return '#444453';
  return palette.background;
}

function lineColor(name) {
  if (/road-access-restricted/.test(name)) return '#d19398';
  if (/road-access-limited/.test(name)) return '#d0b784';
  if (/aerialway/.test(name)) return '#8692ad';
  if (/water|river|stream/.test(name)) return palette.waterway;
  if (/casing|:outline|:bridge|_case(?:_|$)/.test(name)) return palette.roadCasing;
  if (/runway|taxiway|apron/.test(name)) return palette.pavement;
  if (/motorway|_(?:mot)(?:_|$)/.test(name)) return palette.highway;
  if (/trunk|primary|_(?:pri)(?:_|$)/.test(name)) return palette.mainRoad;
  if (/secondary|tertiary|_sec(?:_|$)/.test(name)) return palette.secondaryRoad;
  if (/^(?:(?:bridge|tunnel)-)?way-(?:footway|path|steps) streets$/.test(name)) return palette.walkingPath;
  if (/path|service/.test(name)) return '#526d74';
  if (/boundary/.test(name)) return '#53667a';
  if (/rail|aeroway/.test(name)) return '#56677b';
  return palette.street;
}

// Recolor the loaded style before its first frame. Geometry, label placement,
// fonts, sprites, source URLs and provider attribution stay intact. The CARTO
// land-cover filter also includes agricultural areas already present in its tiles.
function transformStyle(previousStyle, style) {
  var layers = (style.layers || []).filter(function(layer) {
    return layer.type !== 'raster';
  }).map(function(layer) {
    var copy = Object.assign({}, layer);
    var paint = copy.paint = Object.assign({}, layer.paint);
    var name = (layer.id + ' ' + (layer['source-layer'] || '')).toLowerCase();
    if (layer.type === 'background') paint['background-color'] = palette.background;
    if (layer.type === 'fill') {
      if (layer.id === 'landcover' && layer['source-layer'] === 'landuse' && layer.filter) {
        copy.filter = ['any', layer.filter, ['in', ['coalesce', ['get', 'kind'], ['get', 'class'], ''], ['literal', agriculturalKinds]]];
      }
      if (layer.id === 'landuse' && layer['source-layer'] === 'landuse' && layer.filter) {
        copy.filter = ['any', layer.filter, ['in', ['get', 'kind'], ['literal', pavedAirportKinds]]];
      }
      delete paint['fill-pattern'];
      paint['fill-color'] = fillColor(name, layer.id.toLowerCase());
      if (paint['fill-outline-color']) paint['fill-outline-color'] = /building/.test(name) ? palette.buildingOutline : fillColor(name, layer.id.toLowerCase());
    }
    if (layer.type === 'fill-extrusion') paint['fill-extrusion-color'] = palette.building;
    if (layer.type === 'line') paint['line-color'] = lineColor(name);
    if (layer.type === 'line' && /^aeroway-(runway|taxiway)$/.test(layer.id)) {
      // Preserve paved surfaces at overview zooms instead of exposing grass
      // beneath them when the provider's runway/taxiway lines disappear.
      copy.minzoom = 10;
      copy.layout = Object.assign({}, layer.layout, { 'line-cap': /taxiway/.test(layer.id) ? 'round' : 'butt', 'line-join': 'round' });
      paint['line-width'] = ['interpolate', ['exponential', 2], ['zoom'], 10, /runway/.test(layer.id) ? 1 : 0.5, 18, /runway/.test(layer.id) ? 256 : 128];
    }
    // Shields include their own light sprite background. Keep the provider's
    // text contrast and halo instead of applying a dark street-label outline.
    if (layer.type === 'symbol' && layer.layout && layer.layout['text-field'] && !/shield/.test(name)) {
      paint['text-color'] = /water/.test(name) ? '#a7cce8' : /transportation|highway|roadname|street_labels|streets_polygons_labels/.test(name) ? palette.mutedText : palette.text;
      if (layer['source-layer'] === 'public_transport') paint['icon-color'] = palette.mutedText;
      if (/poi/.test(name) && !/^label-address-/.test(layer.id)) {
        paint['text-color'] = ['match', ['coalesce', ['get', 'kind'], ['get', 'class'], ['get', 'amenity'], ['get', 'leisure'], ['get', 'tourism'], ''],
          ['park', 'garden', 'playground', 'camp_site', 'caravan_site', 'viewpoint', 'zoo', 'alpine_hut'], '#a0c59b',
          ['restaurant', 'cafe', 'bar', 'fast_food'], '#d4af8e',
          ['school', 'college', 'university'], '#c0af9b',
          ['hospital', 'clinic', 'pharmacy'], '#e4a9b3',
          ['hotel', 'motel', 'hostel', 'guest_house', 'bed_and_breakfast'], '#c3b5df',
          palette.mutedText];
        if (layer.layout['icon-image']) paint['icon-color'] = paint['text-color'];
      }
      paint['text-halo-color'] = palette.halo;
      paint['text-halo-width'] = 1;
      paint['text-halo-blur'] = 0.2;
      if (layer.id === 'label-park-name' || /^poi-destination-(playground|sports)$/.test(layer.id)) {
        paint['text-color'] = '#e0f1d5';
        if (layer.layout['icon-image']) paint['icon-color'] = paint['text-color'];
        paint['text-halo-color'] = '#263a2a';
        paint['text-halo-blur'] = 0;
      } else if (layer.id === 'poi-destination-culture') {
        paint['text-color'] = '#c3d5e4';
        paint['icon-color'] = paint['text-color'];
        paint['text-halo-color'] = '#263441';
        paint['text-halo-blur'] = 0;
      } else if (layer.id === 'poi-destination-education') {
        paint['text-color'] = '#e3d2b9';
        paint['icon-color'] = paint['text-color'];
        paint['text-halo-color'] = '#332d29';
        paint['text-halo-blur'] = 0;
      }
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
