'use strict';

const { estimateGrams, lowestEmissions } = require('../src/route_emissions');

function step(distance, duration, mode = 'driving') {
  return { distance, duration, mode };
}

function route(...legs) {
  return { legs: legs.map(steps => ({ steps })) };
}

test('uses each step’s speeds with interpolation and clamps to the COPERT range', () => {
  const response = route(
    [step(1000, 1800), step(1000, 144)],
    [step(1000, 20), step(0, 0, 'driving')]
  );
  expect(estimateGrams(response)).toBeCloseTo(320.2 + (197.8 + 165.5) / 2 + 156.6);
});

test('includes ferry crossings, shuttle trains and standalone idling', () => {
  const response = route([step(2000, 144), step(3000, 1800, 'ferry'), step(1000, 500, 'train'), step(0, 20)]);
  expect(estimateGrams(response)).toBeCloseTo(2 * 136.7 + 4 * 250 + 20 * 0.5);
});

test.each([
  undefined, {}, route([]), route([step(0, 2)]), route([step(500, 30, 'cycling')]),
  route([step(500, 30), step(500, NaN)]), route([step(-100, 30)])
])('skips estimates for incomplete or non-car routes', response => {
  expect(estimateGrams(response)).toBeNull();
});

function compare(...grams) {
  return lowestEmissions(grams.map(estimatedEmissionsGrams => ({ estimatedEmissionsGrams })));
}

test('reports alternative savings relative to the main route', () => {
  expect(compare(2000, 1600, 1500)).toEqual({ index: 2, savings: 0.25 });
});

test('identifies the main route without a percentage when it emits less', () => {
  expect(compare(1400, 1600)).toEqual({ index: 0, savings: null });
});

test('omits the badge for ties, incomplete comparisons and single routes', () => {
  expect(compare(1400, 1400)).toBeNull();
  expect(compare(1400, 1400 + 0.000000001)).toBeNull();
  expect(compare(1400, undefined, 1600)).toBeNull();
  expect(compare(1400)).toBeNull();
});

test('can prefer a longer route with a steadier speed', () => {
  const slow = estimateGrams(route([step(10000, 1800)]));
  const steady = estimateGrams(route([step(11000, 540)]));
  expect(compare(slow, steady).index).toBe(1);
});
