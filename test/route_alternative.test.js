'use strict';

var resolveInitialAlternative = require('../src/route_alternative');

function makeRoute(routesIndex) {
  return { name: 'Route ' + routesIndex, coordinates: [], routesIndex: routesIndex };
}

describe('resolveInitialAlternative', function() {

  describe('returns null (no switch) when', function() {

    test('desiredAlt is 0', function() {
      var route = makeRoute(0);
      var result = resolveInitialAlternative(route, [makeRoute(1)], 0);
      expect(result).toBeNull();
    });

    test('desiredAlt is undefined', function() {
      var route = makeRoute(0);
      var result = resolveInitialAlternative(route, [makeRoute(1)], undefined);
      expect(result).toBeNull();
    });

    test('desiredAlt is null', function() {
      var route = makeRoute(0);
      var result = resolveInitialAlternative(route, [makeRoute(1)], null);
      expect(result).toBeNull();
    });

    test('desiredAlt is NaN (unparseable string)', function() {
      var route = makeRoute(0);
      var result = resolveInitialAlternative(route, [makeRoute(1)], 'abc');
      expect(result).toBeNull();
    });

    test('desiredAlt is an empty string', function() {
      var route = makeRoute(0);
      var result = resolveInitialAlternative(route, [makeRoute(1)], '');
      expect(result).toBeNull();
    });

    test('route.routesIndex already matches desiredAlt', function() {
      var route = makeRoute(1);
      var result = resolveInitialAlternative(route, [makeRoute(0), makeRoute(2)], 1);
      expect(result).toBeNull();
    });

    test('desiredAlt exceeds available routes (out of bounds)', function() {
      var route = makeRoute(0);
      // Only 3 routes total (indices 0,1,2) — desiredAlt 5 doesn't exist
      var result = resolveInitialAlternative(route, [makeRoute(1), makeRoute(2)], 5);
      expect(result).toBeNull();
    });

    test('desiredAlt equals length (off by one)', function() {
      var route = makeRoute(0);
      // 3 routes, index 3 is past the end
      var result = resolveInitialAlternative(route, [makeRoute(1), makeRoute(2)], 3);
      expect(result).toBeNull();
    });

    test('there are no alternatives and desiredAlt > 0', function() {
      var route = makeRoute(0);
      var result = resolveInitialAlternative(route, [], 1);
      expect(result).toBeNull();
    });

    test('alternatives is undefined', function() {
      var route = makeRoute(0);
      var result = resolveInitialAlternative(route, undefined, 1);
      expect(result).toBeNull();
    });

    test('alternatives is null', function() {
      var route = makeRoute(0);
      var result = resolveInitialAlternative(route, null, 1);
      expect(result).toBeNull();
    });

    test('desiredAlt is negative', function() {
      var route = makeRoute(0);
      var result = resolveInitialAlternative(route, [makeRoute(1)], -1);
      expect(result).toBeNull();
    });

    test('desiredAlt is a non-integer float (e.g. "1.5")', function() {
      var route = makeRoute(0);
      var result = resolveInitialAlternative(route, [makeRoute(1), makeRoute(2)], 1.5);
      expect(result).toBeNull();
    });

    test('desiredAlt is a float string ("1.5")', function() {
      var route = makeRoute(0);
      var result = resolveInitialAlternative(route, [makeRoute(1), makeRoute(2)], '1.5');
      expect(result).toBeNull();
    });
  });

  describe('returns a switch payload when', function() {

    test('desiredAlt matches a middle alternative', function() {
      var route0 = makeRoute(0);
      var route1 = makeRoute(1);
      var route2 = makeRoute(2);
      var result = resolveInitialAlternative(route0, [route1, route2], 1);

      expect(result).not.toBeNull();
      expect(result.route).toBe(route1);
      expect(result.alternatives).toHaveLength(2);
      expect(result.alternatives).toContain(route0);
      expect(result.alternatives).toContain(route2);
    });

    test('desiredAlt is the last alternative', function() {
      var route0 = makeRoute(0);
      var route1 = makeRoute(1);
      var route2 = makeRoute(2);
      var result = resolveInitialAlternative(route0, [route1, route2], 2);

      expect(result).not.toBeNull();
      expect(result.route).toBe(route2);
      expect(result.alternatives).toEqual([route0, route1]);
    });

    test('desiredAlt is a string ("1") that coerces to number', function() {
      var route0 = makeRoute(0);
      var route1 = makeRoute(1);
      var route2 = makeRoute(2);
      // This mimics the URL parser returning strings
      var result = resolveInitialAlternative(route0, [route1, route2], '1');

      expect(result).not.toBeNull();
      expect(result.route).toBe(route1);
      expect(result.alternatives).toContain(route0);
      expect(result.alternatives).toContain(route2);
    });

    test('there is exactly one alternative and it is the target', function() {
      var route0 = makeRoute(0);
      var route1 = makeRoute(1);
      var result = resolveInitialAlternative(route0, [route1], 1);

      expect(result).not.toBeNull();
      expect(result.route).toBe(route1);
      expect(result.alternatives).toEqual([route0]);
    });
  });

  describe('returns referentially correct objects', function() {

    test('the returned route is the exact same object from the input', function() {
      var route0 = makeRoute(0);
      var route1 = makeRoute(1);
      var result = resolveInitialAlternative(route0, [route1], 1);

      expect(result.route).toBe(route1);
    });

    test('returned alternatives are the exact same objects', function() {
      var route0 = makeRoute(0);
      var route1 = makeRoute(1);
      var route2 = makeRoute(2);
      var result = resolveInitialAlternative(route0, [route1, route2], 1);

      expect(result.alternatives[0]).toBe(route0);
      expect(result.alternatives[1]).toBe(route2);
    });
  });
});
