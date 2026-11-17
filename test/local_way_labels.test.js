'use strict';

const { createExpression, featureFilter, validateStyleMin } = require('@maplibre/maplibre-gl-style-spec');
const style = require('../images/openstreetmap/style.json');
const theme = require('../src/vector_theme');

const pathLayer = style.layers.find(layer => layer.id === 'label-path-name');
const serviceLayer = style.layers.find(layer => layer.id === 'label-street-service-name');

function accepts(layer, properties) {
  return featureFilter(layer.filter, 'layers[0].filter').filter({ zoom: 17 }, { type: 2, properties });
}

test.each(['footway', 'path', 'cycleway', 'steps'])('labels named %s features along their geometry', kind => {
  expect(accepts(pathLayer, { kind, name: 'Local way' })).toBe(true);
  expect(accepts(pathLayer, { kind })).toBe(false);
  expect(accepts(pathLayer, { kind, name: '' })).toBe(false);
  expect(accepts(serviceLayer, { kind, name: 'Local way' })).toBe(false);
});

test('adds service-road names without duplicating existing street or track labels', () => {
  expect(accepts(serviceLayer, { kind: 'service', name: 'Alte-Leipziger-Platz' })).toBe(true);
  expect(accepts(serviceLayer, { kind: 'service' })).toBe(false);
  for (const kind of ['motorway', 'primary', 'residential', 'track', 'pedestrian']) {
    expect(accepts(pathLayer, { kind, name: 'Existing road' })).toBe(false);
    expect(accepts(serviceLayer, { kind, name: 'Existing road' })).toBe(false);
  }
});

test('fades local labels in at close zooms and gives existing street names priority', () => {
  expect(pathLayer.minzoom).toBe(15);
  expect(serviceLayer.minzoom).toBeGreaterThan(pathLayer.minzoom);
  const streetIndex = style.layers.findIndex(layer => layer.id === 'label-street-residential');
  for (const layer of [pathLayer, serviceLayer]) {
    const expression = createExpression(layer.paint['text-opacity'], 'layers[0].paint.text-opacity');
    expect(expression.result).toBe('success');
    expect(expression.value.evaluate({ zoom: layer.minzoom })).toBe(0);
    expect(expression.value.evaluate({ zoom: layer.minzoom + 0.4 })).toBe(0.9);
    expect(layer.layout['symbol-placement']).toBe('line');
    expect(layer.layout['symbol-spacing']).toBeGreaterThanOrEqual(400);
    expect(layer.layout['text-allow-overlap']).not.toBe(true);
    expect(style.layers.indexOf(layer)).toBeLessThan(streetIndex);
  }
});

test('keeps local labels and tile sources shared across the light and dark palettes', () => {
  const dark = theme.transformStyle(null, style);
  expect(validateStyleMin(style)).toEqual([]);
  expect(validateStyleMin(dark)).toEqual([]);
  expect(dark.sources).toEqual(style.sources);
  for (const layer of [pathLayer, serviceLayer]) {
    const counterpart = dark.layers.find(candidate => candidate.id === layer.id);
    expect(counterpart.layout).toEqual(layer.layout);
    expect(counterpart.filter).toEqual(layer.filter);
    expect(counterpart.paint['text-opacity']).toEqual(layer.paint['text-opacity']);
    expect(counterpart.paint['text-color']).toBe(theme.palette.mutedText);
  }
});
