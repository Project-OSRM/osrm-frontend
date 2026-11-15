'use strict';

const theme = require('../src/vector_theme');
const { validateStyleMin } = require('@maplibre/maplibre-gl-style-spec');

function styleFixture() {
  return {
    version: 8,
    glyphs: 'https://tiles.example/fonts/{fontstack}/{range}.pbf',
    sources: {
      osm: { type: 'vector', tiles: ['https://tiles.example/{z}/{x}/{y}.pbf'], attribution: 'Provider credit' },
      earth: { type: 'raster', tiles: ['https://tiles.example/{z}/{x}/{y}.png'], tileSize: 256 }
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#fff' } },
      { id: 'earth', type: 'raster', source: 'earth' },
      { id: 'water', type: 'fill', source: 'osm', 'source-layer': 'water', paint: { 'fill-color': '#00f' } },
      { id: 'park', type: 'fill', source: 'osm', 'source-layer': 'park' },
      { id: 'wood', type: 'fill', source: 'osm', 'source-layer': 'landcover' },
      { id: 'road_minor', type: 'line', source: 'osm', 'source-layer': 'transportation', paint: { 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1, 16, 4] } },
      { id: 'road_primary', type: 'line', source: 'osm', 'source-layer': 'transportation' },
      { id: 'poi', type: 'symbol', source: 'osm', 'source-layer': 'poi', layout: { 'text-field': ['get', 'name'] } }
    ]
  };
}

test('applies the reference palette while preserving source data and attribution', () => {
  const original = styleFixture();
  const before = JSON.stringify(original);
  const result = theme.transformStyle(null, original);
  expect(result.layers.find(layer => layer.id === 'water').paint['fill-color']).toBe(theme.palette.water);
  expect(result.layers.find(layer => layer.id === 'wood').paint['fill-color']).toBe(theme.palette.forest);
  expect(result.layers.find(layer => layer.id === 'park').paint['fill-color']).toBe(theme.palette.park);
  expect(result.sources.osm).toEqual(original.sources.osm);
  expect(result.glyphs).toBe(original.glyphs);
  expect(JSON.stringify(original)).toBe(before);
});

test('keeps road hierarchy, widths and label placement intact', () => {
  const original = styleFixture();
  const result = theme.transformStyle(null, original);
  const minor = result.layers.find(layer => layer.id === 'road_minor');
  const primary = result.layers.find(layer => layer.id === 'road_primary');
  expect(primary.paint['line-color']).not.toBe(minor.paint['line-color']);
  expect(minor.paint['line-width']).toEqual(original.layers.find(layer => layer.id === 'road_minor').paint['line-width']);
  expect(result.layers.find(layer => layer.id === 'poi').layout).toEqual(original.layers.find(layer => layer.id === 'poi').layout);
});

test('removes raster backdrops and unused raster sources from the vector theme', () => {
  const result = theme.transformStyle(null, styleFixture());
  expect(result.layers.some(layer => layer.type === 'raster')).toBe(false);
  expect(result.sources.earth).toBeUndefined();
});

test('produces a valid MapLibre style including category-based point-of-interest labels', () => {
  expect(validateStyleMin(theme.transformStyle(null, styleFixture()))).toEqual([]);
});

test('preserves highway shield contrast without adding the dark label halo', () => {
  const original = styleFixture();
  const layout = { 'text-field': ['get', 'ref'], 'icon-image': 'road_3', 'text-size': 10 };
  original.layers.push(
    { id: 'highway-shield-non-us', type: 'symbol', source: 'osm', 'source-layer': 'transportation_name', layout },
    { id: 'road_shield_us', type: 'symbol', source: 'osm', 'source-layer': 'transportation_name', layout,
      paint: { 'text-color': '#111111', 'text-halo-color': '#ffffff', 'text-halo-width': 0.2 } }
  );
  const result = theme.transformStyle(null, original);
  expect(result.layers.find(layer => layer.id === 'highway-shield-non-us').paint).toEqual({});
  expect(result.layers.find(layer => layer.id === 'road_shield_us').paint).toEqual(original.layers.at(-1).paint);
  expect(result.layers.find(layer => layer.id === 'highway-shield-non-us').layout).toEqual(layout);
  expect(result.layers.find(layer => layer.id === 'poi').paint['text-halo-width']).toBe(1);
  expect(validateStyleMin(result)).toEqual([]);
});

test('preserves CARTO road casing and major-road hierarchy in the dark palette', () => {
  const original = styleFixture();
  ['road_pri_case_noramp', 'road_mot_fill_noramp', 'road_minor_fill'].forEach(id => {
    original.layers.push({ id, type: 'line', source: 'osm', 'source-layer': 'roads' });
  });
  const result = theme.transformStyle(null, original);
  expect(result.layers.find(layer => layer.id === 'road_pri_case_noramp').paint['line-color']).toBe(theme.palette.roadCasing);
  expect(result.layers.find(layer => layer.id === 'road_mot_fill_noramp').paint['line-color']).toBe(theme.palette.highway);
  expect(result.layers.find(layer => layer.id === 'road_minor_fill').paint['line-color']).toBe(theme.palette.street);
});

test('distinguishes land cover, neighborhoods and building roofs while keeping the palette', () => {
  const original = styleFixture();
  ['landcover', 'landuse_residential', 'building', 'building-top'].forEach(id => {
    original.layers.push({ id, type: 'fill', source: 'osm', 'source-layer': 'landuse' });
  });
  const result = theme.transformStyle(null, original);
  const paint = id => result.layers.find(layer => layer.id === id).paint;
  expect(paint('landcover')['fill-color']).toContain(theme.palette.forest);
  expect(paint('landcover')['fill-color']).toContain(theme.palette.grass);
  expect(paint('landcover')['fill-color']).toContain(theme.palette.park);
  expect(paint('landuse_residential')['fill-color']).toBe(theme.palette.residential);
  expect(paint('building')['fill-color']).toBe(theme.palette.buildingBase);
  expect(paint('building-top')['fill-color']).toBe(theme.palette.building);
  expect(validateStyleMin(result)).toEqual([]);
});

test('keeps street labels quieter than place labels and preserves their layout', () => {
  const original = styleFixture();
  ['roadname_minor', 'place_city'].forEach(id => {
    original.layers.push({ id, type: 'symbol', source: 'osm', 'source-layer': 'places', layout: { 'text-field': ['get', 'name'] } });
  });
  const result = theme.transformStyle(null, original);
  expect(result.layers.find(layer => layer.id === 'roadname_minor').paint['text-color']).toBe(theme.palette.mutedText);
  expect(result.layers.find(layer => layer.id === 'place_city').paint['text-color']).toBe(theme.palette.text);
  expect(result.layers.find(layer => layer.id === 'roadname_minor').layout).toEqual(original.layers.find(layer => layer.id === 'roadname_minor').layout);
});

test('uses a consistent blue palette for water areas, rivers and streams', () => {
  const original = styleFixture();
  ['waterway', 'river', 'stream'].forEach(id => {
    original.layers.push({ id, type: 'line', source: 'osm', 'source-layer': 'waterway' });
  });
  original.layers.push({ id: 'water_shadow', type: 'fill', source: 'osm', 'source-layer': 'water' });
  const result = theme.transformStyle(null, original);
  ['waterway', 'river', 'stream'].forEach(id => {
    expect(result.layers.find(layer => layer.id === id).paint['line-color']).toBe(theme.palette.waterway);
  });
  expect(result.layers.find(layer => layer.id === 'water').paint['fill-color']).toBe(theme.palette.water);
  expect(result.layers.find(layer => layer.id === 'water_shadow').paint['fill-color']).toBe(theme.palette.waterShadow);
  expect(validateStyleMin(result)).toEqual([]);
});

test('renders agricultural areas already present in CARTO tiles with distinct friendly greens', () => {
  const original = styleFixture();
  const landcover = { id: 'landcover', type: 'fill', source: 'osm', 'source-layer': 'landuse',
    filter: ['in', ['get', 'kind'], ['literal', ['forest', 'grass', 'park']]] };
  original.layers.push(landcover);
  const result = theme.transformStyle(null, original);
  const layer = result.layers.find(layer => layer.id === 'landcover');
  const filter = require('@maplibre/maplibre-gl-style-spec').featureFilter(layer.filter, 'layers.landcover.filter');
  ['farmland', 'orchard', 'vineyard', 'forest', 'grass', 'park'].forEach(kind => {
    expect(filter.filter({ zoom: 13 }, { type: 3, properties: { kind } })).toBe(true);
  });
  expect(filter.filter({ zoom: 13 }, { type: 3, properties: { kind: 'industrial' } })).toBe(false);
  expect(layer.paint['fill-color']).toContain(theme.palette.farmland);
  expect(layer.paint['fill-color']).toContain(theme.palette.orchard);
  expect(new Set([theme.palette.forest, theme.palette.park, theme.palette.grass, theme.palette.farmland]).size).toBe(4);
  expect(original.layers.find(layer => layer.id === 'landcover').filter).toEqual(landcover.filter);
  expect(validateStyleMin(result)).toEqual([]);
});
