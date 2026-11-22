'use strict';

const { featureFilter, validateStyleMin } = require('@maplibre/maplibre-gl-style-spec');
const style = require('../images/openstreetmap/style.json');
const { palette, transformStyle } = require('../src/vector_theme');
const satellite = require('../src/vector_satellite');

const light = id => style.layers.find(layer => layer.id === id);
const dark = transformStyle(null, style);
const imagery = satellite.transformStyle(style);

test.each(['footway', 'path', 'steps'])('draws surface, bridge and tunnel %s with distinct dashes', kind => {
  const layers = ['', 'bridge-', 'tunnel-'].map(prefix => light(prefix + 'way-' + kind));
  const flags = [{}, { bridge: true }, { tunnel: true }];
  for (const [index, layer] of layers.entries()) {
    expect(layer.minzoom).toBe(15);
    const filter = featureFilter(layer.filter, 'layers[0].filter');
    expect(filter.filter({ zoom: 17 }, { type: 2, properties: { kind, ...flags[index] } })).toBe(true);
    expect(filter.filter({ zoom: 17 }, { type: 2, properties: { kind: 'cycleway', ...flags[index] } })).toBe(false);
    expect(layer.paint['line-width'].stops.at(-1)[1]).toBeLessThan(3);
    expect(layer.paint['line-dasharray']).toHaveLength(2);
  }
  expect(layers[2].paint['line-dasharray']).not.toEqual(layers[0].paint['line-dasharray']);
  expect(light('way-' + kind + ':outline')).toBeUndefined();
  expect(light('bridge-way-' + kind + ':bridge')).toBeDefined();
});

test('retains path hierarchy and separate access markings across all palettes', () => {
  for (const themed of [style, dark, imagery]) {
    expect(validateStyleMin(themed)).toEqual([]);
    const byId = id => themed.layers.find(layer => layer.id === id);
    const path = byId('way-footway');
    expect(path.paint['line-dasharray']).toEqual(light('way-footway').paint['line-dasharray']);
    expect(byId('way-cycleway').paint['line-dasharray']).toBeUndefined();
    expect(byId('street-pedestrian').paint['line-dasharray']).toBeUndefined();
    for (const id of ['road-access-restricted', 'road-access-limited']) {
      const access = byId(id);
      expect(themed.layers.indexOf(path)).toBeLessThan(themed.layers.indexOf(access));
      expect(access.paint['line-color']).not.toBe(path.paint['line-color']);
      expect(access.paint['line-dasharray']).not.toEqual(path.paint['line-dasharray']);
    }
  }
  const darkPath = dark.layers.find(layer => layer.id === 'way-footway');
  expect(darkPath.paint['line-color']).toBe(palette.walkingPath);
  expect(darkPath.paint['line-color']).not.toBe(light('way-footway').paint['line-color']);
});
