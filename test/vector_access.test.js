/** @jest-environment jsdom */
'use strict';

const L = require('leaflet');
const access = require('../src/vector_access');
const { createExpression, featureFilter, validateStyleMin } = require('@maplibre/maplibre-gl-style-spec');
const style = require('../images/openstreetmap/style.json');
const theme = require('../src/vector_theme');

test.each([['driving', 'motorcar'], ['car', 'motorcar'], ['bike', 'bicycle'], ['cycling', 'bicycle'], ['foot', 'foot'], ['walking', 'foot'], [' BIKE ', 'bicycle'], ['truck', null], ['', null], [undefined, null]])('maps profile %s to its explicit access field', (profile, field) => {
  expect(access.propertyForProfile(profile)).toBe(field);
});

test('applies initial modes and history changes to inactive backgrounds too', () => {
  const layers = { osm: { setRoutingProfile: jest.fn() }, dark: { setRoutingProfile: jest.fn() }, raster: {} };
  for (const profile of ['bike', 'foot', 'driving', 'bike']) access.applyProfile(layers, { profile });
  expect(layers.osm.setRoutingProfile.mock.calls).toEqual([['bike'], ['foot'], ['driving'], ['bike']]);
  expect(layers.dark.setRoutingProfile.mock.calls).toEqual(layers.osm.setRoutingProfile.mock.calls);
});

test('retains the latest mode before style load and changes only global paint state afterwards', () => {
  let map;
  const renderer = { options: { globalState: { other: true } }, getMaplibreMap: () => map };
  access.configureRenderer(renderer);
  renderer.setRoutingProfile('bike');
  expect(renderer.options.globalState).toEqual({ other: true, [access.STATE_KEY]: 'bicycle' });
  let loaded = false;
  map = Object.assign(new L.Evented(), { getStyle: () => loaded ? style : undefined, setGlobalStateProperty: jest.fn(), setStyle: jest.fn(), setFilter: jest.fn() });
  renderer.setRoutingProfile('driving');
  renderer.setRoutingProfile('foot');
  expect(map.setGlobalStateProperty).not.toHaveBeenCalled();
  loaded = true;
  map.fire('style.load');
  expect(map.setGlobalStateProperty).toHaveBeenCalledTimes(1);
  expect(map.setGlobalStateProperty).toHaveBeenLastCalledWith(access.STATE_KEY, 'foot');
  renderer.setRoutingProfile('driving');
  renderer.setRoutingProfile('car');
  expect(map.setGlobalStateProperty).toHaveBeenCalledTimes(2);
  renderer.setRoutingProfile('custom-truck');
  expect(map.setGlobalStateProperty).toHaveBeenLastCalledWith(access.STATE_KEY, 'none');
  expect(map.setStyle).not.toHaveBeenCalled();
  expect(map.setFilter).not.toHaveBeenCalled();
});

test.each([['restricted', 'no', 0.65], ['limited', 'limited', 0.7]])('shows %s markings only for the selected mode and explicit tile values', (suffix, flag, opacity) => {
  const layer = style.layers.find(layer => layer.id === 'road-access-' + suffix);
  for (const field of ['motorcar', 'bicycle', 'foot']) {
    const globalState = { [access.STATE_KEY]: field };
    const result = createExpression(layer.paint['line-opacity'], 'layers[0].paint.line-opacity', undefined, globalState);
    expect(result.result).toBe('success');
    const evaluate = properties => result.value.evaluate({ zoom: 17 }, { type: 2, properties });
    expect(evaluate({ [field]: flag })).toBe(opacity);
    expect(evaluate({ [field]: 'yes' })).toBe(0);
    expect(evaluate({ [field]: suffix === 'restricted' ? 'limited' : 'no' })).toBe(0);
    expect(evaluate({})).toBe(0);
    const other = field === 'foot' ? 'motorcar' : 'foot';
    expect(evaluate({ [other]: flag })).toBe(0);
    globalState[access.STATE_KEY] = 'none';
    expect(evaluate({ [field]: flag })).toBe(0);
  }
  const filter = featureFilter(layer.filter, 'layers[0].filter').filter;
  expect(filter({ zoom: 17 }, { type: 2, properties: { rail: true, foot: flag } })).toBe(false);
  expect(filter({ zoom: 17 }, { type: 2, properties: { motorcar: flag } })).toBe(true);
  expect(JSON.stringify(layer.filter)).not.toContain('global-state');
});

test('keeps a valid shared style and does not promote generic bicycle permission to a dedicated cycleway', () => {
  expect(style.layers.some(layer => layer['source-layer'] === 'streets' && JSON.stringify(layer.filter).includes('designated'))).toBe(false);
  const dark = theme.transformStyle(null, style);
  expect(validateStyleMin(style)).toEqual([]);
  expect(validateStyleMin(dark)).toEqual([]);
  expect(dark.sources).toEqual(style.sources);
  for (const id of ['road-access-restricted', 'road-access-limited']) {
    const original = style.layers.find(layer => layer.id === id);
    const counterpart = dark.layers.find(layer => layer.id === id);
    expect(counterpart.filter).toEqual(original.filter);
    expect(counterpart.paint['line-opacity']).toEqual(original.paint['line-opacity']);
    expect(counterpart.paint['line-color']).not.toBe(theme.palette.street);
  }
});
