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
