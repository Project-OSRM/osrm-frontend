'use strict';

const { featureFilter, createExpression, validateStyleMin } = require('@maplibre/maplibre-gl-style-spec');
const style = require('../images/openstreetmap/style.json');
const theme = require('../src/vector_theme');
const satellite = require('../src/vector_satellite');
const covered = style.layers.find(layer => layer.id === 'water-covered');

function accepts(properties) {
  return featureFilter(covered.filter, 'layers[0].filter').filter({ zoom: 17 }, { type: 2, properties });
}

function evaluate(property, zoom, kind = 'stream') {
  const expression = createExpression(covered.paint[property], 'layers[0].paint.' + property);
  expect(expression.result).toBe('success');
  return expression.value.evaluate({ zoom }, { type: 2, properties: { kind } });
}

test.each(['river', 'canal', 'stream', 'ditch', 'drain'])('shows covered %s features without also drawing them as open water', kind => {
  const properties = { kind, tunnel: true, bridge: false };
  expect(accepts(properties)).toBe(true);
  const matching = style.layers.filter(layer => layer['source-layer'] === 'water_lines' &&
    featureFilter(layer.filter, 'layers[0].filter').filter({ zoom: 17 }, { type: 2, properties }));
  expect(matching.map(layer => layer.id)).toEqual([covered.id]);
});

test.each([
  { kind: 'stream', tunnel: false },
  { kind: 'stream' },
  { kind: 'stream', bridge: true },
  { kind: 'stream', tunnel: 'true' },
  { kind: 'pipeline', tunnel: true },
  { tunnel: true }
])('does not invent a covered watercourse for %j', properties => {
  expect(accepts(properties)).toBe(false);
});

test('keeps ordinary streams solid and covered segments thin, dashed and limited to detail zooms', () => {
  const openStream = style.layers.find(layer => layer.id === 'water-stream');
  expect(featureFilter(openStream.filter, 'layers[0].filter').filter({ zoom: 17 }, {
    type: 2, properties: { kind: 'stream', tunnel: false, bridge: false }
  })).toBe(true);
  expect(openStream.paint['line-dasharray']).toBeUndefined();
  expect(covered.minzoom).toBe(14);
  expect(evaluate('line-opacity', 14)).toBe(0);
  expect(evaluate('line-opacity', 14.5)).toBe(0.65);
  expect(evaluate('line-width', 17)).toBe(2);
  expect(evaluate('line-width', 20)).toBe(2);
  expect(evaluate('line-width', 17, 'river')).toBe(3);
  expect(covered.paint['line-dasharray']).toEqual([2, 2]);
  expect(style.layers.indexOf(covered)).toBeGreaterThan(style.layers.findIndex(layer => layer.id === 'bridge-street-motorway'));
  expect(style.layers.indexOf(covered)).toBeGreaterThan(style.layers.findIndex(layer => layer.id === 'building'));
  expect(style.layers.indexOf(covered)).toBeLessThan(style.layers.findIndex(layer => layer.id === 'label-place-locality'));
});

test('preserves covered geometry in both palettes without adding water to the Satellite street overlay', () => {
  for (const palette of [style, theme.transformStyle(null, style), satellite.transformStyle(style)]) {
    expect(validateStyleMin(palette)).toEqual([]);
    expect(palette.sources).toEqual(style.sources);
    const layer = palette.layers.find(layer => layer.id === covered.id);
    expect(layer.filter).toEqual(covered.filter);
    expect(layer.paint['line-width']).toEqual(covered.paint['line-width']);
    expect(layer.paint['line-dasharray']).toEqual(covered.paint['line-dasharray']);
    expect(layer.paint['line-opacity']).toEqual(covered.paint['line-opacity']);
  }
  expect(theme.transformStyle(null, style).layers.find(layer => layer.id === covered.id).paint['line-color']).toBe(theme.palette.waterway);
  expect(satellite.transformStyle(style).layers.find(layer => layer.id === covered.id).layout.visibility).toBe('none');
});
