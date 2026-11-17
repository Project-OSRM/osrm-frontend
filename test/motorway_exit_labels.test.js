'use strict';

const { createExpression, featureFilter, validateStyleMin } = require('@maplibre/maplibre-gl-style-spec');
const style = require('../images/openstreetmap/style.json');
const theme = require('../src/vector_theme');

const referenceLayer = style.layers.find(layer => layer.id === 'label-motorway-exit-shield-reference');
const nameLayer = style.layers.find(layer => layer.id === 'label-motorway-exit-name');

function accepts(layer, properties) {
  return featureFilter(layer.filter, 'layers[0].filter').filter({ zoom: 14 }, { type: 1, properties });
}

test('shows exit references only for numbered motorway junctions', () => {
  expect(accepts(referenceLayer, { kind: 'motorway_junction', ref: '1', name: 'Oberursel-Nord' })).toBe(true);
  expect(accepts(referenceLayer, { kind: 'motorway_junction', ref: '7A' })).toBe(true);
  expect(accepts(referenceLayer, { kind: 'motorway_junction' })).toBe(false);
  expect(accepts(referenceLayer, { kind: 'motorway_junction', ref: '' })).toBe(false);
  expect(accepts(referenceLayer, { kind: 'motorway', ref: 'A 661' })).toBe(false);
  const expression = createExpression(referenceLayer.layout['text-field'], 'layers[0].layout.text-field');
  expect(expression.result).toBe('success');
  expect(expression.value.evaluate({ zoom: 14 }, { properties: { ref: '7A' } })).toBe('7A');
});

test('adds names at closer zooms and supports junctions with a name but no reference', () => {
  expect(accepts(nameLayer, { kind: 'motorway_junction', name: 'Oberursel-Nord' })).toBe(true);
  expect(accepts(nameLayer, { kind: 'motorway_junction' })).toBe(false);
  expect(accepts(nameLayer, { kind: 'motorway_junction', name: '' })).toBe(false);
  expect(accepts(nameLayer, { kind: 'bus_stop', name: 'Station' })).toBe(false);
  expect(nameLayer.minzoom).toBeGreaterThan(referenceLayer.minzoom);
  expect(nameLayer.layout['text-offset'][1]).toBeGreaterThan(0);
  expect(referenceLayer.layout['text-allow-overlap']).not.toBe(true);
  expect(nameLayer.layout['text-allow-overlap']).not.toBe(true);
});

test('keeps compact exit shields readable in both palettes using the shared tile source', () => {
  expect(referenceLayer.layout['icon-image']).toBe('osrm-exit-shield');
  expect(referenceLayer.paint['text-color']).toBe('#f8f8f8');
  expect(referenceLayer.layout['icon-text-fit']).toBe('both');
  expect(referenceLayer.layout['icon-text-fit-padding']).toEqual([1, 2, 1, 2]);
  const dark = theme.transformStyle(null, style);
  expect(validateStyleMin(style)).toEqual([]);
  expect(validateStyleMin(dark)).toEqual([]);
  expect(dark.sources).toEqual(style.sources);
  expect(dark.layers.find(layer => layer.id === referenceLayer.id).paint).toEqual(referenceLayer.paint);
  expect(dark.layers.find(layer => layer.id === nameLayer.id).layout).toEqual(nameLayer.layout);
});
