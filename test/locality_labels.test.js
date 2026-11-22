'use strict';

const { featureFilter, createExpression, validateStyleMin } = require('@maplibre/maplibre-gl-style-spec');
const style = require('../images/openstreetmap/style.json');
const { transformStyle } = require('../src/vector_theme');
const satellite = require('../src/vector_satellite');
const { localizeStyle } = require('../src/vector_labels');
const locality = style.layers.find(layer => layer.id === 'label-place-locality');

function evaluate(field, properties, zoom = 15) {
  const parsed = createExpression(field, 'layers[0].layout.text-field');
  expect(parsed.result).toBe('success');
  return parsed.value.evaluate({ zoom }, { type: 1, properties });
}

test.each(['locality', 'hamlet', 'village', 'town', 'city', 'neighbourhood'])('limits locality labels to the matching place kind: %s', kind => {
  const filter = featureFilter(locality.filter, 'layers[0].filter');
  expect(filter.filter({ zoom: 15 }, { type: 1, properties: { kind, name: 'Place' } })).toBe(kind === 'locality');
});

test('shows translated locality names and leaves unnamed places blank', () => {
  const properties = { name: 'Local name', name_fr: 'Nom français' };
  const french = localizeStyle(style, 'fr').layers.find(layer => layer.id === locality.id);
  expect(evaluate(french.layout['text-field'], properties)).toBe('Nom français');
  const german = localizeStyle(style, 'de').layers.find(layer => layer.id === locality.id);
  expect(evaluate(german.layout['text-field'], properties)).toBe('Local name');
  expect(evaluate(locality.layout['text-field'], {})).toBe('');
  expect(locality.layout['icon-image']).toBeUndefined();
});

test('adds small mixed-case detail below street and settlement names without forcing overlap', () => {
  expect(locality.minzoom).toBe(13);
  expect(evaluate(locality.paint['text-opacity'], {}, 13)).toBe(0);
  expect(evaluate(locality.paint['text-opacity'], {}, 13.5)).toBe(0.8);
  expect(locality.layout['text-size']).toBe(10);
  expect(locality.layout['text-transform']).not.toBe('uppercase');
  expect(locality.layout['text-allow-overlap']).not.toBe(true);
  expect(locality.layout['text-ignore-placement']).not.toBe(true);
  for (const id of ['label-place-hamlet', 'label-place-city', 'label-street-primary', 'poi-destination-hospital']) {
    expect(style.layers.indexOf(locality)).toBeLessThan(style.layers.findIndex(layer => layer.id === id));
  }
});

test('keeps locality labels in both palettes and the Satellite overlay using the same data', () => {
  for (const palette of [style, transformStyle(null, style), satellite.transformStyle(style)]) {
    expect(validateStyleMin(palette)).toEqual([]);
    expect(palette.sources).toEqual(style.sources);
    const layer = palette.layers.find(layer => layer.id === locality.id);
    expect(layer['source-layer']).toBe('place_labels');
    expect(layer.layout.visibility).not.toBe('none');
    expect(layer.filter).toEqual(locality.filter);
    expect(layer.paint['text-opacity']).toEqual(locality.paint['text-opacity']);
  }
});
