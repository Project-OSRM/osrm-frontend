'use strict';

// Unit tests for the _leftOrRight monkey-patch applied to L.Routing.OSRMv1
// (see src/index.js and issue #255: ramp arrows not matching instructions).
//
// The patched function must:
//   - map modifiers containing 'left'  → 'Left'
//   - map modifiers containing 'right' → 'Right'
//   - preserve other modifiers (e.g. 'straight') unchanged

function patchedLeftOrRight(d) {
  if (!d) return d;
  if (d.indexOf('left') >= 0) return 'Left';
  if (d.indexOf('right') >= 0) return 'Right';
  return d;
}

describe('_leftOrRight patch (issue #255)', () => {
  test('maps "left" to "Left"', () => {
    expect(patchedLeftOrRight('left')).toBe('Left');
  });

  test('maps "slight left" to "Left"', () => {
    expect(patchedLeftOrRight('slight left')).toBe('Left');
  });

  test('maps "sharp left" to "Left"', () => {
    expect(patchedLeftOrRight('sharp left')).toBe('Left');
  });

  test('maps "right" to "Right"', () => {
    expect(patchedLeftOrRight('right')).toBe('Right');
  });

  test('maps "slight right" to "Right"', () => {
    expect(patchedLeftOrRight('slight right')).toBe('Right');
  });

  test('maps "sharp right" to "Right"', () => {
    expect(patchedLeftOrRight('sharp right')).toBe('Right');
  });

  test('preserves "straight" instead of defaulting to "Right" (core bug fix)', () => {
    expect(patchedLeftOrRight('straight')).toBe('straight');
  });

  test('preserves "uturn"', () => {
    expect(patchedLeftOrRight('uturn')).toBe('uturn');
  });

  test('handles null/undefined gracefully', () => {
    expect(patchedLeftOrRight(null)).toBeNull();
    expect(patchedLeftOrRight(undefined)).toBeUndefined();
  });
});
