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
      },
      route: function(waypoints, cb) { cb(null, waypoints); }
    };
    expect(fakeRouter._leftOrRight('straight')).toBe('Right'); // broken before patch
    applyPatches(fakeRouter);
    expect(fakeRouter._leftOrRight('straight')).toBe('straight'); // fixed after patch
  });

  test('applyPatches also installs wrapWaypoints on the router', () => {
    const { applyPatches } = require('../src/router_patches');
    const routedWaypoints = [];
    const fakeRouter = {
      _leftOrRight: function() {},
      route: function(waypoints, cb) {
        routedWaypoints.push(...waypoints);
        if (cb) cb(null, waypoints);
      }
    };
    applyPatches(fakeRouter);

    const wp = { latLng: { lat: 51.5, lng: -362.8, wrap: function() { return { lat: 51.5, lng: -2.8 }; } }, name: '' };
    fakeRouter.route([wp], function() {});
    expect(routedWaypoints[0].latLng.lng).toBeCloseTo(-2.8);
  });
});

describe('wrapWaypoints (issues #206, #307)', () => {
  const { wrapWaypoints } = require('../src/router_patches');

  function makeLatLng(lat, lng) {
    // Mirrors Leaflet's LatLng.wrap() using the standard modulo formula.
    var obj = { lat: lat, lng: lng };
    obj.wrap = function() { return { lat: lat, lng: ((lng + 180) % 360 + 360) % 360 - 180 }; };
    return obj;
  }

  test('wraps a waypoint with longitude < -180 before routing', () => {
    const routed = [];
    const router = { route: function(wps, cb) { routed.push(...wps); } };
    wrapWaypoints(router);

    router.route([{ latLng: makeLatLng(53.265, -362.806), name: 'A' }], function() {});
    expect(routed[0].latLng.lng).toBeCloseTo(-2.806);
  });

  test('re-offsets snapped route.waypoints back to original coordinate space', () => {
    // LRM calls setWaypoints(route.waypoints) after routing (snap mode),
    // so snapped coords must stay in the same world copy as the original click.
    const router = {
      route: function(wps, cb) {
        // Simulate OSRM returning a snapped position at the wrapped coordinates
        const snapped = [{ latLng: { lat: 53.270, lng: -2.800 }, name: '' }];
        cb(null, [{ waypoints: snapped }]);
      }
    };
    wrapWaypoints(router);

    let receivedRoutes;
    router.route(
      [{ latLng: makeLatLng(53.265, -362.806), name: 'A' }],
      function(err, routes) { receivedRoutes = routes; }
    );
    // The snapped waypoint (-2.800) should be re-offset by -360 to match the
    // original world copy (-362.800).
    expect(receivedRoutes[0].waypoints[0].latLng.lng).toBeCloseTo(-362.800);
  });

  test('re-offset snapped waypoint preserves wrap() for further use', () => {
    const router = {
      route: function(wps, cb) {
        const snapped = [{ latLng: { lat: 39.9, lng: 116.603 }, name: '' }];
        cb(null, [{ waypoints: snapped }]);
      }
    };
    wrapWaypoints(router);

    let receivedRoutes;
    router.route(
      [{ latLng: makeLatLng(39.9, 1556.6), name: 'B' }],
      function(err, routes) { receivedRoutes = routes; }
    );
    const reoffset = receivedRoutes[0].waypoints[0].latLng;
    // Snapped lng 116.603 + offset 1440 = 1556.603
    expect(reoffset.lng).toBeCloseTo(1556.603);
    // wrap() on the re-offset latlng should return the in-range value
    expect(reoffset.wrap().lng).toBeCloseTo(116.603);
  });

  test('does not re-offset snapped waypoints when original coords are in range', () => {
    const router = {
      route: function(wps, cb) {
        const snapped = [{ latLng: { lat: 48.8, lng: 2.303 }, name: '' }];
        cb(null, [{ waypoints: snapped }]);
      }
    };
    wrapWaypoints(router);

    let receivedRoutes;
    router.route(
      [{ latLng: makeLatLng(48.8, 2.3), name: 'Paris' }],
      function(err, routes) { receivedRoutes = routes; }
    );
    // No offset applied — result stays as-is
    expect(receivedRoutes[0].waypoints[0].latLng.lng).toBeCloseTo(2.303);
  });

  test('wraps a waypoint with longitude > +180 before routing', () => {
    const routed = [];
    const router = { route: function(wps, cb) { routed.push(...wps); } };
    wrapWaypoints(router);

    router.route([{ latLng: makeLatLng(39.9, 1556.6), name: 'B' }], function() {});
    // 1556.6 mod 360 = 116.6
    expect(routed[0].latLng.lng).toBeCloseTo(116.6);
  });

  test('leaves coordinates already in [-180, 180] unchanged', () => {
    const routed = [];
    const router = { route: function(wps, cb) { routed.push(...wps); } };
    wrapWaypoints(router);

    router.route([{ latLng: makeLatLng(48.8, 2.3), name: 'Paris' }], function() {});
    expect(routed[0].latLng.lng).toBeCloseTo(2.3);
  });

  test('handles null waypoints gracefully', () => {
    const routed = [];
    const router = { route: function(wps, cb) { routed.push(...wps); } };
    wrapWaypoints(router);

    expect(() => router.route([null, { latLng: makeLatLng(0, 0), name: '' }], function() {})).not.toThrow();
    expect(routed[1].latLng.lng).toBeCloseTo(0);
  });

  test('handles waypoints without wrap() gracefully (no Leaflet LatLng)', () => {
    const routed = [];
    const router = { route: function(wps, cb) { routed.push(...wps); } };
    wrapWaypoints(router);

    const plainLatLng = { lat: 51.5, lng: -362.8 }; // no .wrap()
    router.route([{ latLng: plainLatLng, name: 'X' }], function() {});
    // Without .wrap(), the original (unwrapped) coordinate is passed through
    expect(routed[0].latLng.lng).toBeCloseTo(-362.8);
  });

  test('does not mutate the original waypoint object', () => {
    const routed = [];
    const router = { route: function(wps, cb) { routed.push(...wps); } };
    wrapWaypoints(router);

    const original = { latLng: makeLatLng(51.5, -362.8), name: 'orig' };
    router.route([original], function() {});
    expect(original.latLng.lng).toBeCloseTo(-362.8); // unchanged
    expect(routed[0].latLng.lng).toBeCloseTo(-2.8);   // wrapped copy
  });

  test('re-offsets route.coordinates so the polyline draws in the correct world copy', () => {
    // OSRM returns in-range coordinates (e.g. lng≈116 for Seattle-area routes).
    // When the map is panned to lng≈1556 (4 × 360° east), the polyline must be
    // re-projected by +1440° so LRM draws it at the right viewport position and
    // fitBounds() does not jump the map to the wrapped world copy.
    const coords = [
      { lat: 39.90, lng: 116.39 },
      { lat: 39.92, lng: 116.45 },
    ];
    const router = {
      route: function(wps, cb) {
        cb(null, [{
          waypoints: [{ latLng: { lat: 39.90, lng: 116.39 }, name: '' }],
          coordinates: coords,
        }]);
      }
    };
    wrapWaypoints(router);

    let receivedRoutes;
    router.route(
      [{ latLng: makeLatLng(39.9, 1556.6), name: 'B' }],
      function(err, routes) { receivedRoutes = routes; }
    );
    // Offset = 1556.6 - 116.6 = 1440 (4 × 360°)
    expect(receivedRoutes[0].coordinates[0].lng).toBeCloseTo(116.39 + 1440);
    expect(receivedRoutes[0].coordinates[1].lng).toBeCloseTo(116.45 + 1440);
  });

  test('does not re-offset route.coordinates when coords are already in range', () => {
    const coords = [{ lat: 48.8, lng: 2.30 }, { lat: 48.9, lng: 2.35 }];
    const router = {
      route: function(wps, cb) {
        cb(null, [{ waypoints: [{ latLng: { lat: 48.8, lng: 2.30 }, name: '' }], coordinates: coords }]);
      }
    };
    wrapWaypoints(router);

    let receivedRoutes;
    router.route(
      [{ latLng: makeLatLng(48.8, 2.3), name: 'Paris' }],
      function(err, routes) { receivedRoutes = routes; }
    );
    expect(receivedRoutes[0].coordinates[0].lng).toBeCloseTo(2.30);
  });
});
