/**
 * @jest-environment jsdom
 */
'use strict';

// Ensure jsdom for history APIs
const layerUtils = require('../src/layer_utils');

describe('handleBaselayerChange', function() {
  test('persists layer and updates state when present', function() {
    const ls = { set: jest.fn() };
    const state = { options: {}, update: jest.fn() };
    const evt = { name: 'Satellite' };

    layerUtils.handleBaselayerChange(evt, ls, state, { userInitiated: true });

    expect(ls.set).toHaveBeenCalledWith('layer', 'Satellite');
    expect(state.options.layer).toBe('Satellite');
    expect(state.update).toHaveBeenCalled();
  });

  test('works when state is missing', function() {
    const ls = { set: jest.fn() };
    const evt = { name: 'Streets' };

    expect(function() {
      layerUtils.handleBaselayerChange(evt, ls, undefined, { userInitiated: true });
    }).not.toThrow();

    expect(ls.set).toHaveBeenCalledWith('layer', 'Streets');
  });

  test('is tolerant of missing ls', function() {
    const state = { options: {}, update: jest.fn() };
    const evt = { name: 'Outdoors' };

    expect(function() {
      layerUtils.handleBaselayerChange(evt, null, state, { userInitiated: true });
    }).not.toThrow();

    expect(state.options.layer).toBe('Outdoors');
    expect(state.update).toHaveBeenCalled();
  });

  test('does not persist when not user initiated', function() {
    const ls = { set: jest.fn() };
    const state = { options: {}, update: jest.fn() };
    const evt = { name: 'Hiking' };

    layerUtils.handleBaselayerChange(evt, ls, state, { userInitiated: false });

    expect(ls.set).not.toHaveBeenCalled();
    expect(state.options.layer).toBe('Hiking');
    expect(state.update).not.toHaveBeenCalled();
  });
});


test('keeps old Standard and Vector links pointing to Dark Vector', () => {
  const dark = {}, osm = {}, german = {};
  const layers = { OpenStreetMap: osm, 'Dark Vector': dark, 'OpenStreetMap.de': german };
  for (const name of ['Standard', 'standard', 'Vector', 'streets', 'Dark Vector', 'dark vector']) {
    expect(layerUtils.resolveLayerByName(layers, name)).toBe(dark);
  }
  expect(layerUtils.resolveLayerByName(layers, 'osm.org')).toBe(osm);
  expect(layerUtils.resolveLayerByName(layers, 'osm.de')).toBe(german);
  expect(layerUtils.resolveLayerByName(layers, 'unknown')).toBeUndefined();
});

test('resolves shared map layer names to raster layers in Docker', () => {
  const layers = { Streets: {}, 'openstreetmap.org': {}, 'openstreetmap.de': {}, 'Dark Vector': {} };
  expect(layerUtils.resolveLayerByName(layers, 'streets')).toBe(layers.Streets);
  expect(layerUtils.resolveLayerByName(layers, 'OpenStreetMap')).toBe(layers['openstreetmap.org']);
  expect(layerUtils.resolveLayerByName(layers, 'osm.org')).toBe(layers['openstreetmap.org']);
  expect(layerUtils.resolveLayerByName(layers, 'osm.de')).toBe(layers['openstreetmap.de']);
});
