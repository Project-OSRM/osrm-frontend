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
