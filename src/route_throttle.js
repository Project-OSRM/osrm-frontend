'use strict';

/**
 * Backs a router off when the routing service starts refusing requests.
 *
 * Dragging a waypoint routes continuously — LRM issues one request every
 * `routeDragInterval` — and the public demo servers answer a burst of those
 * with HTTP 429. Each failure makes LRM clear the route line, so a rate-limited
 * drag both spams the service and flickers.
 *
 * The status cannot be trusted to identify it: a 429 served without CORS headers
 * is indistinguishable from a network failure to XMLHttpRequest, and arrives as
 * `status: -1` with `message: "HTTP request failed: undefined"`. Repeated
 * failure in quick succession is therefore the only usable signal.
 *
 * Only the live preview is dropped while backed off. LRM's request on drag end
 * is not marked `geometryOnly`, so it always goes through and the route still
 * settles on wherever the user let go.
 *
 * @module route_throttle
 */

// Long enough for a demo server's window to roll over, short enough that a
// deliberate drag recovers its preview without the user wondering why.
var COOLOFF_MS = 4000;
var MAX_COOLOFF_MS = 30000;
// One failure is a hiccup — a dropped connection, a transient 5xx. Two in a row
// is the service saying no.
//
// Only failures of drag previews count. A one-off route that fails for its own
// reasons — no route between the waypoints, a malformed request — says nothing
// about the request rate, and letting it feed the counter would throttle a drag
// that had not yet been refused anything.
var FAILURES_BEFORE_BACKOFF = 2;

/**
 * @param {object} router — an LRM router; its `route` is replaced in place
 * @param {object} [options]
 * @param {function} [options.now] — () => ms, for tests
 * @param {function} [options.onBackoff] — (coolOffMs) => void, called once each
 *   time a new back-off starts
 * @returns {object} the same router
 */
function throttleOnRateLimit(router, options) {
  options = options || {};
  if (!router || typeof router.route !== 'function') return router;
  var now = typeof options.now === 'function' ? options.now : function() {
    return Date.now();
  };
  var onBackoff = typeof options.onBackoff === 'function' ? options.onBackoff : function() {};

  var original = router.route;
  var failures = 0;
  var coolOff = COOLOFF_MS;
  var quietUntil = 0;

  function succeeded() {
    failures = 0;
    coolOff = COOLOFF_MS;
    quietUntil = 0;
  }

  function failed() {
    failures++;
    if (failures < FAILURES_BEFORE_BACKOFF) return;
    quietUntil = now() + coolOff;
    onBackoff(coolOff);
    // Each further failure waits longer, so a service that is still refusing is
    // not asked again at the same rate.
    coolOff = Math.min(coolOff * 2, MAX_COOLOFF_MS);
  }

  router.route = function(waypoints, callback, context, routeOptions) {
    var preview = !!(routeOptions && routeOptions.geometryOnly);
    // Skipped rather than queued: by the time a cool-off ends the pointer has
    // moved on, and a stale preview is worse than none. LRM keeps the line it
    // already has, because the callback it would clear it from never runs.
    if (preview && now() < quietUntil) return undefined;

    return original.call(router, waypoints, function(err) {
      // An abort is LRM superseding its own request, not the service refusing.
      if (err && err.type !== 'abort') {
        if (preview) failed();
      } else if (!err) {
        // Any success shows the service is answering again, whoever asked.
        succeeded();
      }
      // `context || callback` is what the OSRM router itself passes, and the
      // wrapper is meant to be invisible; arguments are forwarded whole so a
      // router with more to say than (err, routes) keeps saying it.
      if (typeof callback === 'function') callback.apply(context || callback, arguments);
    }, context, routeOptions);
  };

  return router;
}

module.exports = {
  throttleOnRateLimit: throttleOnRateLimit,
  COOLOFF_MS: COOLOFF_MS,
  MAX_COOLOFF_MS: MAX_COOLOFF_MS,
  FAILURES_BEFORE_BACKOFF: FAILURES_BEFORE_BACKOFF
};
