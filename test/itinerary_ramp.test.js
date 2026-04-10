'use strict';

// Tests for the leftOrRight helper in src/router_patches.js (issue #255).
// The helper is the canonical implementation used to patch leaflet-routing-machine's
// _leftOrRight method, so testing it here validates the production fix directly.

const { leftOrRight } = require('../src/router_patches');

describe('_leftOrRight patch (issue #255)', () => {
  test('maps "left" to "Left"', () => {
    expect(leftOrRight('left')).toBe('Left');
  });

  test('maps "slight left" to "Left"', () => {
    expect(leftOrRight('slight left')).toBe('Left');
  });

  test('maps "sharp left" to "Left"', () => {
    expect(leftOrRight('sharp left')).toBe('Left');
  });

  test('maps "right" to "Right"', () => {
    expect(leftOrRight('right')).toBe('Right');
  });

  test('maps "slight right" to "Right"', () => {
    expect(leftOrRight('slight right')).toBe('Right');
  });

  test('maps "sharp right" to "Right"', () => {
    expect(leftOrRight('sharp right')).toBe('Right');
  });

  test('preserves "straight" instead of defaulting to "Right" (core bug fix)', () => {
    expect(leftOrRight('straight')).toBe('straight');
  });

  test('preserves "uturn"', () => {
    expect(leftOrRight('uturn')).toBe('uturn');
  });

  test('handles null/undefined gracefully', () => {
    expect(leftOrRight(null)).toBeNull();
    expect(leftOrRight(undefined)).toBeUndefined();
  });
});

describe('applyPatches', () => {
  test('overrides _leftOrRight on the router instance', () => {
    const { applyPatches } = require('../src/router_patches');
    const fakeRouter = {
      _leftOrRight: function(d) {
        return d.indexOf('left') >= 0 ? 'Left' : 'Right'; // original broken impl
      }
    };
    expect(fakeRouter._leftOrRight('straight')).toBe('Right'); // broken before patch
    applyPatches(fakeRouter);
    expect(fakeRouter._leftOrRight('straight')).toBe('straight'); // fixed after patch
  });
});

