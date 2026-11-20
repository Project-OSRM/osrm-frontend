'use strict';

const { validateStyleMin } = require('@maplibre/maplibre-gl-style-spec');
const { transformStyle } = require('../src/vector_satellite');
const { applyPalette } = require('../src/vector_palette');
const original = require('../images/openstreetmap/style.json');

test('keeps imagery exposed while drawing roads, names, references and exits', () => {
  const style = transformStyle(original);
  expect(validateStyleMin(style)).toEqual([]);
  expect(style.sources).toEqual(original.sources);
  const layer = id => style.layers.find(candidate => candidate.id === id);
  for (const id of ['background', 'land-forest', 'water-area', 'building', 'poi-destination-hospital']) {
    expect(layer(id).layout.visibility).toBe('none');
  }
  expect(layer('background').paint['background-opacity']).toBe(0);
  for (const id of ['street-primary', 'street-residential', 'label-street-primary', 'label-main-road-shield', 'label-motorway-exit-shield-reference', 'label-place-city', 'label-address-housenumber']) {
    expect(layer(id).layout && layer(id).layout.visibility).not.toBe('none');
  }
  const opacity = layer('street-primary').paint['line-opacity'].stops.at(-1)[1];
  expect(opacity).toBeGreaterThan(0);
  expect(opacity).toBeLessThan(1);
  expect(layer('label-street-primary').paint['text-color']).toBe('#f1f5f8');
  expect(layer('label-main-road-shield').paint['text-color']).toBe(original.layers.find(candidate => candidate.id === 'label-main-road-shield').paint['text-color']);
});

test('preserves zoom-dependent transparency, road widths and access expressions', () => {
  const style = transformStyle(original);
  const byId = id => style.layers.find(candidate => candidate.id === id);
  const pedestrian = byId('street-pedestrian-zone');
  expect(pedestrian.paint['fill-opacity'].stops.map(stop => stop[0])).toEqual([12, 13, 14, 15]);
  expect(pedestrian.paint['fill-opacity'].stops.map(stop => stop[1])).toEqual([0, 0.2, 0, 0.2]);
  for (const layer of style.layers.filter(layer => layer.type === 'line' && layer['source-layer'] === 'streets')) {
    expect(layer.paint['line-width']).toEqual(original.layers.find(candidate => candidate.id === layer.id).paint['line-width']);
  }
  for (const layer of style.layers.filter(layer => /^road-access-/.test(layer.id))) {
    expect(layer.paint['line-opacity']).toEqual(original.layers.find(candidate => candidate.id === layer.id).paint['line-opacity']);
  }
});

test('restores the full map without replacing sources or overwriting localized name fields', () => {
  const map = { setPaintProperty: jest.fn(), setLayoutProperty: jest.fn(), setStyle: jest.fn(), removeSource: jest.fn() };
  applyPalette(map, original, 'satellite', 'dark');
  expect(map.setLayoutProperty).toHaveBeenCalledWith('land-forest', 'visibility', 'none');
  expect(map.setPaintProperty).toHaveBeenCalledWith('background', 'background-opacity', 0);
  map.setLayoutProperty.mockClear();
  map.setPaintProperty.mockClear();
  applyPalette(map, original, 'original', 'satellite');
  expect(map.setLayoutProperty).toHaveBeenCalledWith('land-forest', 'visibility', null);
  expect(map.setPaintProperty).toHaveBeenCalledWith('background', 'background-opacity', null);
  expect(map.setPaintProperty).toHaveBeenCalledWith('street-primary', 'line-opacity', original.layers.find(layer => layer.id === 'street-primary').paint['line-opacity']);
  expect(map.setLayoutProperty.mock.calls.every(call => call[1] === 'visibility')).toBe(true);
  expect(map.setStyle).not.toHaveBeenCalled();
  expect(map.removeSource).not.toHaveBeenCalled();
  expect(original.layers.find(layer => layer.id === 'land-forest').layout).toBeUndefined();
});

test('can clear an in-progress full map immediately without making the loading background opaque', () => {
  const map = { setPaintProperty: jest.fn(), setLayoutProperty: jest.fn() };
  applyPalette(map, original, 'satellite', 'original', true);
  expect(map.setLayoutProperty).toHaveBeenCalledWith('land-forest', 'visibility', 'none');
  expect(map.setPaintProperty).toHaveBeenCalledWith('background', 'background-color', 'transparent');
  expect(map.setPaintProperty).toHaveBeenCalledWith('background', 'background-opacity', 0);
  map.setPaintProperty.mockClear();
  applyPalette(map, original, 'original', 'satellite', true);
  expect(map.setPaintProperty).toHaveBeenCalledWith('background', 'background-color', 'transparent');
  expect(map.setLayoutProperty).toHaveBeenCalledWith('land-forest', 'visibility', null);
});
