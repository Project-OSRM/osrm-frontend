'use strict';

const { featureFilter, createExpression, validateStyleMin } = require('@maplibre/maplibre-gl-style-spec');
const style = require('../images/openstreetmap/style.json');
const { transformStyle } = require('../src/vector_theme');
const satellite = require('../src/vector_satellite');
const { localizeStyle } = require('../src/vector_labels');
const ruralPlace = style.layers.find(layer => layer.id === 'label-place-rural');

function evaluate(expression, properties, zoom = 15) {
  const parsed = createExpression(expression, 'layers[0].layout.text-field');
  expect(parsed.result).toBe('success');
  return parsed.value.evaluate({ zoom }, { type: 1, properties });
}

test.each(['farm', 'isolated_dwelling', 'locality', 'hamlet', 'village', 'town', 'city', 'neighbourhood', undefined])('labels only farms and isolated dwellings: %s', kind => {
  const properties = { name: 'Place', ...(kind ? { kind } : {}) };
  const matchingLayers = style.layers.filter(layer => layer['source-layer'] === 'place_labels' &&
    featureFilter(layer.filter, 'layers[0].filter').filter({ zoom: 15 }, { type: 1, properties }));
  if (['farm', 'isolated_dwelling'].includes(kind)) {
    expect(matchingLayers.map(layer => layer.id)).toEqual([ruralPlace.id]);
  } else {
    expect(matchingLayers).not.toContain(ruralPlace);
  }
});

test('uses translated rural names with local fallback and no label for unnamed features', () => {
  const french = localizeStyle(style, 'fr-CA').layers.find(layer => layer.id === ruralPlace.id);
  expect(evaluate(french.layout['text-field'], { name: 'Farm', name_fr: 'Ferme' })).toBe('Ferme');
  expect(evaluate(french.layout['text-field'], { name: 'Langwiesenhof' })).toBe('Langwiesenhof');
  expect(evaluate(french.layout['text-field'], { name: 'Farm', name_fr: '' })).toBe('Farm');
  expect(evaluate(ruralPlace.layout['text-field'], {})).toBe('');
});

test('fades in small rural names below street, POI and settlement labels', () => {
  expect(ruralPlace.minzoom).toBe(13);
  expect(evaluate(ruralPlace.paint['text-opacity'], {}, 13)).toBe(0);
  expect(evaluate(ruralPlace.paint['text-opacity'], {}, 13.25)).toBeCloseTo(0.45);
  expect(evaluate(ruralPlace.paint['text-opacity'], {}, 13.5)).toBe(0.9);
  expect(ruralPlace.layout['text-size']).toBeLessThan(12);
  expect(ruralPlace.layout['text-transform']).not.toBe('uppercase');
  expect(ruralPlace.layout['icon-image']).toBeUndefined();
  expect(ruralPlace.layout['text-allow-overlap']).not.toBe(true);
  expect(ruralPlace.layout['text-ignore-placement']).not.toBe(true);
  for (const id of ['label-place-hamlet', 'label-place-village', 'label-place-city', 'label-street-primary', 'poi-destination-hospital']) {
    expect(style.layers.indexOf(ruralPlace)).toBeLessThan(style.layers.findIndex(layer => layer.id === id));
  }
});

test('retains rural names across both palettes and the Satellite overlay without another source', () => {
  for (const palette of [style, transformStyle(null, style), satellite.transformStyle(style)]) {
    expect(validateStyleMin(palette)).toEqual([]);
    expect(palette.sources).toEqual(style.sources);
    const layer = palette.layers.find(layer => layer.id === ruralPlace.id);
    expect(layer['source-layer']).toBe('place_labels');
    expect(layer.layout.visibility).not.toBe('none');
    expect(layer.filter).toEqual(ruralPlace.filter);
    expect(layer.paint['text-opacity']).toEqual(ruralPlace.paint['text-opacity']);
  }
});
