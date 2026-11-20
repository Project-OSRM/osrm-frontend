'use strict';

const { featureFilter, createExpression, validateStyleMin } = require('@maplibre/maplibre-gl-style-spec');
const style = require('../images/openstreetmap/style.json');
const { transformStyle } = require('../src/vector_theme');
const { localizeStyle } = require('../src/vector_labels');
const satellite = require('../src/vector_satellite');

const layer = style.layers.find(candidate => candidate.id === 'label-address-poi-housenumber');

test.each([
  [{ housenumber: '12', shop: 'bakery' }, true],
  [{ housenumber: '12a', amenity: 'cafe' }, true],
  [{ housenumber: '2-14', amenity: 'hospital' }, true],
  [{ housenumber: '' }, false],
  [{ name: 'Bakery' }, false]
])('labels only POIs with a nonempty house number: %j', (properties, expected) => {
  const filter = featureFilter(layer.filter, 'layers[0].filter');
  expect(filter.filter({ zoom: 18 }, { type: 1, properties })).toBe(expected);
  expect(layer['source-layer']).toBe('pois');
  expect(layer.layout['text-field']).toBe('{housenumber}');
});

test('adds close-up address detail without displacing names or category icons', () => {
  const ordinary = style.layers.find(candidate => candidate.id === 'label-address-housenumber');
  expect(layer.minzoom).toBe(16.5);
  const opacity = createExpression(layer.paint['text-opacity'], 'layers[0].paint.text-opacity');
  expect(opacity.result).toBe('success');
  expect(opacity.value.evaluate({ zoom: 16.5 })).toBe(0);
  expect(opacity.value.evaluate({ zoom: 17 })).toBe(1);
  expect(layer.layout['text-size']).toEqual(ordinary.layout['text-size']);
  expect(layer.layout['text-allow-overlap']).not.toBe(true);
  expect(layer.layout['text-ignore-placement']).not.toBe(true);
  expect(layer.layout['text-variable-anchor']).toHaveLength(4);
  expect(layer.layout['icon-image']).toBeUndefined();
  const position = style.layers.indexOf(layer);
  for (const candidate of style.layers.filter(candidate => candidate.id.startsWith('poi-') || candidate.id.startsWith('label-street-'))) {
    expect(position).toBeLessThan(style.layers.indexOf(candidate));
  }
});

test('keeps address numbers neutral, untranslated and visible in all three palettes', () => {
  const dark = transformStyle(null, style);
  for (const palette of [style, dark, satellite.transformStyle(style)]) {
    expect(validateStyleMin(palette)).toEqual([]);
    const address = palette.layers.find(candidate => candidate.id === layer.id);
    expect(address.layout.visibility).not.toBe('none');
    expect(localizeStyle(palette, 'ja').layers.find(candidate => candidate.id === layer.id).layout['text-field']).toBe('{housenumber}');
  }
  expect(dark.layers.find(candidate => candidate.id === layer.id).paint['text-color'])
    .toEqual(dark.layers.find(candidate => candidate.id === 'label-address-housenumber').paint['text-color']);
});
