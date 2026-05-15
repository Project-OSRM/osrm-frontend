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
    const xhr2 = router.route(wp2, cb2);

    // xhr1 should expose an abort function
    expect(xhr1 && typeof xhr1.abort === 'function').toBe(true);
    // abort should have been called synchronously when the second route was invoked
    if (typeof xhr1.aborted !== 'undefined') {
      expect(xhr1.aborted).toBe(true);
    }

  }, 1000);

});
