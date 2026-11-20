'use strict';

const { createExpression, featureFilter, validateStyleMin } = require('@maplibre/maplibre-gl-style-spec');
const style = require('../images/openstreetmap/style.json');
const theme = require('../src/vector_theme');

const layer = style.layers.find(candidate => candidate.id === 'label-pedestrian-area-name');

function accepts(properties) {
  return featureFilter(layer.filter, 'layers[0].filter').filter({ zoom: 16 }, { type: 1, properties });
}

test('labels named pedestrian areas using the dedicated point layer', () => {
  expect(layer['source-layer']).toBe('streets_polygons_labels');
  expect(layer.layout['symbol-placement']).toBe('point');
  for (const name of ['Domplatz', 'Bahnhofplatz', 'Fünffingerplätzchen']) {
    const properties = { kind: 'pedestrian', name };
    expect(accepts(properties)).toBe(true);
    const expression = createExpression(layer.layout['text-field'], 'layers[0].layout.text-field');
    expect(expression.result).toBe('success');
    expect(expression.value.evaluate({ zoom: 16 }, { properties })).toBe(name);
  }
});

test.each([
  { kind: 'pedestrian' },
  { kind: 'pedestrian', name: '' },
  { kind: 'residential', name: 'Ordinary street' },
  { kind: 'service', name: 'Access road' },
  { kind: 'runway', name: 'Runway' },
  { name: 'Unclassified area' }
])('does not add an area label for %j', properties => {
  expect(accepts(properties)).toBe(false);
});

test('fades area names in at close zooms and respects other labels', () => {
  expect(layer.minzoom).toBe(15);
  const opacity = createExpression(layer.paint['text-opacity'], 'layers[0].paint.text-opacity');
  expect(opacity.result).toBe('success');
  expect(opacity.value.evaluate({ zoom: 15 })).toBe(0);
  expect(opacity.value.evaluate({ zoom: 15.25 })).toBeCloseTo(0.45);
  expect(opacity.value.evaluate({ zoom: 15.5 })).toBe(0.9);
  expect(layer.layout['text-size']).toBeLessThanOrEqual(12);
  expect(layer.layout['text-padding']).toBeGreaterThanOrEqual(4);
  expect(layer.layout['text-allow-overlap']).not.toBe(true);
  expect(layer.layout['text-ignore-placement']).not.toBe(true);
  expect(style.layers.indexOf(layer)).toBeLessThan(style.layers.findIndex(candidate => candidate.id === 'label-street-pedestrian'));
  expect(style.layers.indexOf(layer)).toBeLessThan(style.layers.findIndex(candidate => candidate.id === 'label-place-neighbourhood'));
});

test('preserves geometry, collision handling and tile sources across palettes', () => {
  const dark = theme.transformStyle(null, style);
  expect(validateStyleMin(style)).toEqual([]);
  expect(validateStyleMin(dark)).toEqual([]);
  expect(dark.sources).toEqual(style.sources);
  const counterpart = dark.layers.find(candidate => candidate.id === layer.id);
  expect(counterpart.layout).toEqual(layer.layout);
  expect(counterpart.filter).toEqual(layer.filter);
  expect(counterpart.paint['text-opacity']).toEqual(layer.paint['text-opacity']);
  expect(counterpart.paint['text-color']).toBe(theme.palette.mutedText);
});
