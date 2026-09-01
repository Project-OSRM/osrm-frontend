'use strict';

/**
 * Backing off a routing service that has started refusing requests. The failures
 * arrive indistinguishable from network errors, so the policy is driven by
 * repetition rather than by status codes.
 */

const routeThrottle = require('../src/route_throttle');

function makeRouter(behaviour) {
  const calls = [];
  const router = {
    route(waypoints, callback, context, options) {
      calls.push({ waypoints, options });
      const outcome = behaviour(calls.length);
      if (outcome !== 'never') callback.call(context, outcome, outcome ? null : ['route']);
      return { id: calls.length };
    }
  };
  return { router, calls };
}

const fails = () => ({ status: -1, message: 'HTTP request failed: undefined' });
const PREVIEW = { geometryOnly: true };
const FINAL = {};

describe('throttleOnRateLimit', () => {
  let clock;
  const now = () => clock;

  beforeEach(() => { clock = 1000; });

  test('passes requests through while the service is answering', () => {
    const { router, calls } = makeRouter(() => null);
    routeThrottle.throttleOnRateLimit(router, { now });
    const seen = [];
    router.route([], (err, routes) => seen.push([err, routes]), null, PREVIEW);
    router.route([], (err, routes) => seen.push([err, routes]), null, PREVIEW);
    expect(calls).toHaveLength(2);
    expect(seen).toEqual([[null, ['route']], [null, ['route']]]);
  });

  test('one failure is a hiccup, not a rate limit', () => {
    const { router, calls } = makeRouter((n) => (n === 1 ? fails() : null));
    routeThrottle.throttleOnRateLimit(router, { now });
    router.route([], () => {}, null, PREVIEW);
    router.route([], () => {}, null, PREVIEW);
    expect(calls).toHaveLength(2);
  });

  test('two failures in a row stop the drag preview', () => {
    const { router, calls } = makeRouter(() => fails());
    const backoffs = [];
    routeThrottle.throttleOnRateLimit(router, { now, onBackoff: (ms) => backoffs.push(ms) });

    router.route([], () => {}, null, PREVIEW);
    router.route([], () => {}, null, PREVIEW);
    expect(backoffs).toEqual([routeThrottle.COOLOFF_MS]);

    router.route([], () => {}, null, PREVIEW);
    expect(calls).toHaveLength(2);
  });

  test('a skipped preview never calls back, so LRM keeps the line it has', () => {
    // LRM clears the route line from the error path of that callback.
    const { router } = makeRouter(() => fails());
    routeThrottle.throttleOnRateLimit(router, { now });
    router.route([], () => {}, null, PREVIEW);
    router.route([], () => {}, null, PREVIEW);

    let calledBack = false;
    const out = router.route([], () => { calledBack = true; }, null, PREVIEW);
    expect(calledBack).toBe(false);
    expect(out).toBeUndefined();
  });

  test('the request on drag end still goes through while backed off', () => {
    // It is not marked geometryOnly, and dropping it would leave the route
    // showing somewhere the waypoint no longer is.
    const { router, calls } = makeRouter(() => fails());
    routeThrottle.throttleOnRateLimit(router, { now });
    router.route([], () => {}, null, PREVIEW);
    router.route([], () => {}, null, PREVIEW);
    router.route([], () => {}, null, FINAL);
    expect(calls).toHaveLength(3);
  });

  test('a request with no options at all is treated as a final one', () => {
    const { router, calls } = makeRouter(() => fails());
    routeThrottle.throttleOnRateLimit(router, { now });
    router.route([], () => {}, null, PREVIEW);
    router.route([], () => {}, null, PREVIEW);
    router.route([], () => {});
    expect(calls).toHaveLength(3);
  });

  test('previews resume once the cool-off has passed', () => {
    const { router, calls } = makeRouter(() => fails());
    routeThrottle.throttleOnRateLimit(router, { now });
    router.route([], () => {}, null, PREVIEW);
    router.route([], () => {}, null, PREVIEW);

    clock += routeThrottle.COOLOFF_MS - 1;
    router.route([], () => {}, null, PREVIEW);
    expect(calls).toHaveLength(2);

    clock += 2;
    router.route([], () => {}, null, PREVIEW);
    expect(calls).toHaveLength(3);
  });

  test('each further failure waits longer, up to a ceiling', () => {
    const { router } = makeRouter(() => fails());
    const backoffs = [];
    routeThrottle.throttleOnRateLimit(router, { now, onBackoff: (ms) => backoffs.push(ms) });
    for (let i = 0; i < 12; i++) {
      clock += routeThrottle.MAX_COOLOFF_MS;
      router.route([], () => {}, null, PREVIEW);
    }
    expect(backoffs[0]).toBe(routeThrottle.COOLOFF_MS);
    expect(backoffs[1]).toBe(routeThrottle.COOLOFF_MS * 2);
    expect(backoffs[backoffs.length - 1]).toBe(routeThrottle.MAX_COOLOFF_MS);
    expect(Math.max.apply(null, backoffs)).toBe(routeThrottle.MAX_COOLOFF_MS);
  });

  test('a success clears the back-off and resets the wait', () => {
    let failing = true;
    const { router, calls } = makeRouter(() => (failing ? fails() : null));
    const backoffs = [];
    routeThrottle.throttleOnRateLimit(router, { now, onBackoff: (ms) => backoffs.push(ms) });
    router.route([], () => {}, null, PREVIEW);
    router.route([], () => {}, null, PREVIEW);

    failing = false;
    clock += routeThrottle.COOLOFF_MS;
    router.route([], () => {}, null, PREVIEW);
    expect(calls).toHaveLength(3);

    failing = true;
    router.route([], () => {}, null, PREVIEW);
    router.route([], () => {}, null, PREVIEW);
    // Back to the first, shortest wait rather than continuing to double.
    expect(backoffs).toEqual([routeThrottle.COOLOFF_MS, routeThrottle.COOLOFF_MS]);
  });

  test('a failed one-off route does not count towards the back-off', () => {
    // No route between the waypoints, or a malformed request, says nothing
    // about the request rate; only drag previews feed the counter.
    const { router, calls } = makeRouter(() => fails());
    const backoffs = [];
    routeThrottle.throttleOnRateLimit(router, { now, onBackoff: (ms) => backoffs.push(ms) });
    router.route([], () => {}, null, FINAL);
    router.route([], () => {}, null, FINAL);
    router.route([], () => {}, null, FINAL);
    expect(backoffs).toEqual([]);
    expect(calls).toHaveLength(3);
  });

  test('a one-off failure does not prime the counter for a later preview', () => {
    const { router } = makeRouter(() => fails());
    const backoffs = [];
    routeThrottle.throttleOnRateLimit(router, { now, onBackoff: (ms) => backoffs.push(ms) });
    router.route([], () => {}, null, FINAL);
    router.route([], () => {}, null, PREVIEW);
    expect(backoffs).toEqual([]);
  });

  test('a one-off success still clears a back-off', () => {
    // Whoever asked, an answer means the service is talking again.
    let failing = true;
    const { router, calls } = makeRouter(() => (failing ? fails() : null));
    routeThrottle.throttleOnRateLimit(router, { now });
    router.route([], () => {}, null, PREVIEW);
    router.route([], () => {}, null, PREVIEW);

    failing = false;
    router.route([], () => {}, null, FINAL);
    const before = calls.length;
    router.route([], () => {}, null, PREVIEW);
    expect(calls).toHaveLength(before + 1);
  });

  test("the callback's this matches what the router itself would pass", () => {
    // OSRMv1 calls back with `context || callback`, and the wrapper is meant to
    // be invisible.
    const { router } = makeRouter(() => null);
    routeThrottle.throttleOnRateLimit(router, { now });
    let seen = null;
    const cb = function() { seen = this; };
    router.route([], cb, undefined, FINAL);
    expect(seen).toBe(cb);
  });

  test('every argument the router passes is forwarded', () => {
    const router = {
      route(waypoints, callback) {
        callback.call(undefined, null, ['route'], 'extra');
        return {};
      }
    };
    routeThrottle.throttleOnRateLimit(router, { now });
    let args = null;
    router.route([], function() { args = Array.prototype.slice.call(arguments); }, null, FINAL);
    expect(args).toEqual([null, ['route'], 'extra']);
  });

  test('an abort is LRM superseding its own request, not a refusal', () => {
    const { router, calls } = makeRouter(() => ({ type: 'abort' }));
    const backoffs = [];
    routeThrottle.throttleOnRateLimit(router, { now, onBackoff: (ms) => backoffs.push(ms) });
    router.route([], () => {}, null, PREVIEW);
    router.route([], () => {}, null, PREVIEW);
    router.route([], () => {}, null, PREVIEW);
    expect(backoffs).toEqual([]);
    expect(calls).toHaveLength(3);
  });

  test('the callback keeps its context and arguments', () => {
    const { router } = makeRouter(() => null);
    routeThrottle.throttleOnRateLimit(router, { now });
    const ctx = { seen: null };
    router.route([], function(err, routes) { this.seen = { err, routes }; }, ctx, FINAL);
    expect(ctx.seen).toEqual({ err: null, routes: ['route'] });
  });

  test('the router is returned, and a router without route is left alone', () => {
    const { router } = makeRouter(() => null);
    expect(routeThrottle.throttleOnRateLimit(router, { now })).toBe(router);
    const bare = { name: 'no route method' };
    expect(routeThrottle.throttleOnRateLimit(bare)).toBe(bare);
    expect(routeThrottle.throttleOnRateLimit(null)).toBeNull();
  });

  test('works without callbacks or options supplied', () => {
    const { router, calls } = makeRouter(() => null);
    routeThrottle.throttleOnRateLimit(router);
    expect(() => router.route([], undefined, null, PREVIEW)).not.toThrow();
    expect(calls).toHaveLength(1);
  });
});
