'use strict';

const rp = require('../src/router_patches');

describe('router_patches', () => {
  test('leftOrRight preserves non-directional modifiers', () => {
    expect(rp.leftOrRight('on ramp straight')).toBe('on ramp straight');
    expect(rp.leftOrRight('keep left then turn')).toBe('Left');
    expect(rp.leftOrRight('turn right ahead')).toBe('Right');
  });

  test('wrapWaypoints aborts previous XHR and ignores older responses', (done) => {
    // Fake router.route that returns an xhr-like object and calls the callback after a delay
    const router = {
      route: function(waypoints, callback /*, context, options */) {
        const delay = (waypoints && waypoints[0] && waypoints[0].delay) || 10;
        const xhr = { aborted: false, abort() { this.aborted = true; } };
        setTimeout(() => {
          // Simulate a response: include waypoints in the shape expected by wrapWaypoints
          const resp = [{ waypoints: (waypoints || []).map(wp => ({ latLng: wp.latLng })) }];
          try {
            callback(null, resp);
          } catch (e) {
            // ignore
          }
        }, delay);
        return xhr;
      }
    };

    rp.wrapWaypoints(router);

    const cb1 = jest.fn();
    const cb2 = jest.fn(() => {
      // allow time for the earlier (slower) response to fire if it wasn't ignored
      setTimeout(() => {
        try {
          expect(cb1).not.toHaveBeenCalled();
          expect(cb2).toHaveBeenCalled();
          done();
        } catch (err) {
          done(err);
        }
      }, 40);
    });

    const wp1 = [{ latLng: { lat: 0, lng: 0, wrap() { return { lat: 0, lng: 0 }; } }, delay: 80 }];
    const wp2 = [{ latLng: { lat: 1, lng: 1, wrap() { return { lat: 1, lng: 1 }; } }, delay: 10 }];

    const xhr1 = router.route(wp1, cb1);
    // Second route should abort the first xhr synchronously within the wrapper
    router.route(wp2, cb2);

    // xhr1 should expose an abort function
    expect(xhr1 && typeof xhr1.abort === 'function').toBe(true);
    // abort should have been called synchronously when the second route was invoked
    if (typeof xhr1.aborted !== 'undefined') {
      expect(xhr1.aborted).toBe(true);
    }

  }, 1000);

  describe('appendApproaches', () => {
    // Stands in for LRM's OSRMv1: buildRouteUrl is the real method's shape, and
    // route() builds the URL the way LRM does, then answers from a fake backend.
    function makeRouter() {
      return {
        urls: [],
        buildRouteUrl: function(waypoints) {
          return 'http://backend/route/v1/driving/' +
            waypoints.map(w => w.latLng.lng + ',' + w.latLng.lat).join(';') +
            '?overview=false&alternatives=true&steps=true';
        },
        route: function(waypoints, callback) {
          this.urls.push(this.buildRouteUrl(waypoints, {}));
          callback(null, [{ waypoints: waypoints.map(w => ({ latLng: w.latLng, options: w.options })) }]);
          return { abort() {} };
        }
      };
    }

    function waypoint(lat, lng, approach) {
      const latLng = { lat: lat, lng: lng, wrap() { return { lat: lat, lng: ((lng + 180) % 360 + 360) % 360 - 180 }; } };
      return approach ? { latLng: latLng, options: { approach: approach } } : { latLng: latLng };
    }

    test('adds nothing when no waypoint is restricted', () => {
      const router = makeRouter();
      rp.appendApproaches(router);
      const url = router.buildRouteUrl([waypoint(1, 2), waypoint(3, 4)]);
      expect(url).not.toContain('approaches');
    });

    test('adds one entry per waypoint, empty for unrestricted ones', () => {
      const router = makeRouter();
      rp.appendApproaches(router);
      const url = router.buildRouteUrl([waypoint(1, 2, 'curb'), waypoint(3, 4), waypoint(5, 6, 'opposite')]);
      expect(url).toMatch(/&approaches=curb;;opposite$/);
    });

    test('keeps the original query parameters', () => {
      const router = makeRouter();
      rp.appendApproaches(router);
      const url = router.buildRouteUrl([waypoint(1, 2), waypoint(3, 4, 'curb')]);
      expect(url).toContain('?overview=false&alternatives=true&steps=true&approaches=;curb');
    });

    test('does not percent-encode the separators', () => {
      const router = makeRouter();
      rp.appendApproaches(router);
      const url = router.buildRouteUrl([waypoint(1, 2, 'curb'), waypoint(3, 4, 'curb')]);
      expect(url).toContain('approaches=curb;curb');
      expect(url).not.toContain('%3B');
    });

    test('can be applied twice without repeating the parameter', () => {
      const router = makeRouter();
      rp.appendApproaches(router);
      rp.appendApproaches(router);
      const url = router.buildRouteUrl([waypoint(1, 2, 'curb'), waypoint(3, 4)]);
      expect(url.match(/approaches=/g)).toHaveLength(1);
    });

    test('leaves a router without buildRouteUrl alone', () => {
      const router = { route: function() {} };
      expect(() => rp.appendApproaches(router)).not.toThrow();
      expect(router.buildRouteUrl).toBeUndefined();
    });

    test('applyPatches installs it', () => {
      const router = makeRouter();
      rp.applyPatches(router);
      const url = router.buildRouteUrl([waypoint(1, 2, 'opposite'), waypoint(3, 4)]);
      expect(url).toMatch(/&approaches=opposite;$/);
    });

    test('the value reaches the backend for a request through wrapWaypoints', () => {
      const router = makeRouter();
      rp.applyPatches(router);
      router.route([waypoint(1, 2, 'curb'), waypoint(3, 4, 'opposite')], () => {});
      expect(router.urls).toHaveLength(1);
      expect(router.urls[0]).toMatch(/&approaches=curb;opposite$/);
    });

    test('the approach survives wrapping and re-offsetting past the antimeridian', () => {
      const router = makeRouter();
      rp.applyPatches(router);
      const callback = jest.fn();
      // -362.8 is wrapped to -2.8 for the request.
      router.route([waypoint(1, -362.8, 'curb'), waypoint(3, 4)], callback);
      expect(router.urls[0]).toMatch(/-2\.8/);
      expect(router.urls[0]).toMatch(/&approaches=curb;$/);
      const result = callback.mock.calls[0][1][0];
      expect(result.waypoints[0].options).toEqual({ approach: 'curb' });
      expect(result.waypoints[0].latLng.lng).toBeCloseTo(-362.8);
    });

    test('a failed request leaves the waypoints\' approaches as they were', () => {
      const router = makeRouter();
      router.route = function(waypoints, callback) {
        this.buildRouteUrl(waypoints, {});
        callback({ status: 'InvalidValue' });
        return { abort() {} };
      };
      rp.applyPatches(router);
      const waypoints = [waypoint(1, 2, 'opposite'), waypoint(3, 4)];
      const callback = jest.fn();
      router.route(waypoints, callback);
      expect(callback.mock.calls[0][0]).toEqual({ status: 'InvalidValue' });
      expect(waypoints[0].options).toEqual({ approach: 'opposite' });
    });
  });

});
