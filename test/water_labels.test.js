'use strict';

const { featureFilter, validateStyleMin } = require('@maplibre/maplibre-gl-style-spec');
const style = require('../images/openstreetmap/style.json');
const theme = require('../src/vector_theme');

function accepts(id, properties) {
  const layer = style.layers.find(candidate => candidate.id === id);
  return featureFilter(layer.filter, 'layers[0].filter').filter({ zoom: 14 }, { type: 1, properties });
}

test('labels named water bodies while keeping small fountains and unnamed areas out', () => {
  expect(accepts('label-water-area-major', { kind: 'water', name: 'Lake', way_area: 100000 })).toBe(true);
  expect(accepts('label-water-area-major', { kind: 'water', name: 'Pond', way_area: 12973 })).toBe(false);
  expect(accepts('label-water-area-local', { kind: 'water', name: 'Rechneigrabenweiher', way_area: 12973 })).toBe(true);
  expect(accepts('label-water-area-local', { kind: 'water', name: 'Fountain', way_area: 99 })).toBe(false);
  expect(accepts('label-water-area-local', { kind: 'water', way_area: 100000 })).toBe(false);
  expect(accepts('label-water-area-local', { kind: 'water', name: '', way_area: 100000 })).toBe(false);
  expect(accepts('label-water-area-local', { kind: 'glacier', name: 'Glacier', way_area: 100000 })).toBe(false);
});

test('places river names along the water and delays stream names until close zooms', () => {
  expect(accepts('label-water-river', { kind: 'river', name: 'Main' })).toBe(true);
  expect(accepts('label-water-river', { kind: 'canal', name: 'Canal' })).toBe(true);
  expect(accepts('label-water-river', { kind: 'stream', name: 'Urselbach' })).toBe(false);
  expect(accepts('label-water-stream', { kind: 'stream', name: 'Urselbach' })).toBe(true);
  expect(accepts('label-water-stream', { kind: 'stream', name: 'Underground', tunnel: true })).toBe(false);
  expect(accepts('label-water-stream', { kind: 'stream', name: '' })).toBe(false);
  const river = style.layers.find(layer => layer.id === 'label-water-river');
  const stream = style.layers.find(layer => layer.id === 'label-water-stream');
  expect(river.minzoom).toBeLessThan(stream.minzoom);
  expect(river.layout['symbol-placement']).toBe('line');
  const major = style.layers.find(layer => layer.id === 'label-water-area-major');
  const local = style.layers.find(layer => layer.id === 'label-water-area-local');
  expect(major.maxzoom).toBe(local.minzoom);
});

test('keeps water labels and tile sources shared between the light and dark palettes', () => {
  const dark = theme.transformStyle(null, style);
  expect(validateStyleMin(style)).toEqual([]);
  expect(validateStyleMin(dark)).toEqual([]);
  expect(dark.sources).toEqual(style.sources);
  for (const layer of style.layers.filter(layer => layer.id.startsWith('label-water-'))) {
    const darkLayer = dark.layers.find(candidate => candidate.id === layer.id);
    expect(darkLayer.layout).toEqual(layer.layout);
    expect(darkLayer.filter).toEqual(layer.filter);
    expect(darkLayer.paint['text-color']).toBe('#a7cce8');
  }
});
