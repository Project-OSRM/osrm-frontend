'use strict';
const { describeRoutes } = require('../src/route_properties');
const route = (time, distance = 10000, instructions) => ({ summary: { totalTime: time, totalDistance: distance }, instructions });

test('shows useful trade-offs instead of just labeling every other route Alternative', () => {
  expect(describeRoutes([route(1300, 24300), route(1330, 20000)])).toEqual([
    ['Fastest'], ['Shortest', 'Similar arrival time']
  ]);
});

test.each([[600, 60], [2400, 120], [7200, 180]])('uses a bounded, trip-relative similar-arrival threshold for a %s-second journey', (fastest, tolerance) => {
  const badges = describeRoutes([route(fastest), route(fastest + tolerance), route(fastest + tolerance + 1)]);
  expect(badges).toEqual([['Fastest'], ['Similar arrival time'], ['Alternative']]);
});

test('allows ties without redundant badges for equal distances or a single route', () => {
  expect(describeRoutes([route(600), route(600.5)])).toEqual([['Fastest'], ['Fastest']]);
  expect(describeRoutes([route(600)])).toEqual([['Fastest']]);
  expect(describeRoutes([])).toEqual([]);
});

test('does not claim comparisons when summary metrics are missing or invalid', () => {
  expect(describeRoutes([route(NaN, 1000), route(600, 2000)])).toEqual([['Shortest'], ['Alternative']]);
  expect(describeRoutes([route(600, undefined), route(630, -1)])).toEqual([['Fastest'], ['Similar arrival time']]);
  expect(describeRoutes([{}, route(Infinity, NaN)])).toEqual([['Alternative'], ['Alternative']]);
});

test('compares meaningful turns without counting departure, arrival, or straight instructions', () => {
  const easy = ['Head', 'Straight', 'Continue', 'Left', 'DestinationReached'].map(type => ({ type }));
  const harder = ['Head', 'Left', 'Right', 'Roundabout', 'SharpLeft', 'DestinationReached'].map(type => ({ type }));
  expect(describeRoutes([route(600, 10000, easy), route(650, 10000, harder)])).toEqual([
    ['Fastest', 'Fewer turns'], ['Similar arrival time']
  ]);
  expect(describeRoutes([route(600, 10000, easy), route(650)])).toEqual([['Fastest'], ['Similar arrival time']]);
});


test('shows Fewer turns for a single-turn advantage and omits it when turn counts tie', () => {
  const one = [{ type: 'Head' }, { type: 'Left' }, { type: 'DestinationReached' }];
  const two = [...one.slice(0, -1), { type: 'Right' }, one.at(-1)];
  expect(describeRoutes([route(600, 10000, one), route(650, 10000, two)])[0]).toContain('Fewer turns');
  expect(describeRoutes([route(600, 10000, one), route(650, 10000, one)]).flat()).not.toContain('Fewer turns');
});
