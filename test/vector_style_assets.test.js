'use strict';
const resolveAssets = require('../src/vector_style_assets');
const { validateStyleMin } = require('@maplibre/maplibre-gl-style-spec');

test.each(['https://example.com/', 'https://example.com/osrm-vector-demo/'])('resolves bundled OSM sprites from %s', base => {
  const original = require('../images/openstreetmap/style.json');
  const result = resolveAssets(original, base + 'images/openstreetmap/style.json');
  expect(result.sprite[0].url).toBe(base + 'images/openstreetmap/sprites');
  expect(original.sprite[0].url).toBe('./sprites');
  expect(result.glyphs).toBe('https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf');
  expect(result.sources['versatiles-shortbread'].tiles[0]).toContain('https://vector.openstreetmap.org/shortbread_v1/');
  expect(validateStyleMin(result)).toEqual([]);
});

test('preserves absolute provider sprites and handles styles without sprites', () => {
  const style = { version: 8, sources: {}, layers: [], sprite: 'https://provider.example/sprites' };
  expect(resolveAssets(style, 'https://example.com/style.json').sprite).toBe(style.sprite);
  const empty = { version: 8, sources: {}, layers: [] };
  expect(resolveAssets(empty, 'https://example.com/style.json')).toBe(empty);
});
