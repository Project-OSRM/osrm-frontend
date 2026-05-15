'use strict';

// TODO: remove this patch once the upstream bug is fixed in leaflet-routing-machine.
// Upstream issue: https://github.com/perliedman/leaflet-routing-machine/issues/719
//
// _leftOrRight defaults anything not containing 'left' to 'Right', so an
// 'on ramp straight' step incorrectly renders a right-turn arrow (osrm-frontend#255).
// This replacement preserves non-directional modifiers like 'straight'.
function leftOrRight(d) {
  if (!d) return d;
  if (d.indexOf('left') >= 0) return 'Left';
  if (d.indexOf('right') >= 0) return 'Right';
  return d;
}

// Patch router.route() to wrap waypoint longitudes into [-180, 180] before
// sending them to the OSRM backend. Without this, panning the map past the
// antimeridian produces out-of-range longitudes (e.g. -362.8) that OSRM
// rejects with a 400 error (issues #206 and #307).
//
// After routing, LRM's 'snap' mode calls setWaypoints(route.waypoints) with the
// snapped positions returned by OSRM. Those are in the wrapped (in-range)
// coordinate space, so LRM would place markers at the wrong world copy.
// We re-offset the snapped latlngs back by the same ±n×360° that was applied
// during wrapping, keeping markers in the correct viewport position.
function wrapWaypoints(router) {
  var origRoute = router.route.bind(router);
  // Track last request so we can abort or ignore out-of-order responses
  router._lastRouteRequestId = router._lastRouteRequestId || 0;
  router._lastXhr = router._lastXhr || null;

  router.route = function(waypoints, callback, context, options) {
    var wrapped = (waypoints || []).map(function(wp) {
      if (!wp || !wp.latLng || typeof wp.latLng.wrap !== 'function') return wp;
      return Object.assign({}, wp, { latLng: wp.latLng.wrap() });
    });

    // Compute the lng offset for each input waypoint (n×360° applied during wrapping).
    var offsets = (waypoints || []).map(function(wp) {
      if (!wp || !wp.latLng || typeof wp.latLng.wrap !== 'function') return 0;
      return wp.latLng.lng - wp.latLng.wrap().lng;
    });
    // Use the first non-zero offset to re-project route.coordinates (the polyline).
    var coordOffset = offsets.reduce(function(acc, o) {
      return acc !== 0 ? acc : o;
    }, 0);

    // Bump request id and abort any previous in-flight request to avoid
    // out-of-order responses interfering with the latest drag action.
    var requestId = (router._lastRouteRequestId || 0) + 1;
    router._lastRouteRequestId = requestId;
    if (router._lastXhr && typeof router._lastXhr.abort === 'function') {
      try {
        router._lastXhr.abort();
      } catch (e) {
        /* ignore abort errors */
      }
    }

    var wrappedCallback = function(err, routes) {
      // Ignore responses from older/aborted requests
      if (router._lastRouteRequestId !== requestId) return;

      if (!err && routes) {
        routes.forEach(function(route) {
          if (route && route.waypoints) {
            route.waypoints = route.waypoints.map(function(snappedWp, i) {
              var orig = waypoints[i];
              if (!snappedWp || !snappedWp.latLng || !orig || !orig.latLng ||
                  typeof orig.latLng.wrap !== 'function') return snappedWp;
              var offset = orig.latLng.lng - orig.latLng.wrap().lng;
              if (offset === 0) return snappedWp;
              var reoffsetLng = snappedWp.latLng.lng + offset;
              var reoffsetLatLng = {
                lat: snappedWp.latLng.lat,
                lng: reoffsetLng,
                wrap: function() {
                  var v = reoffsetLng;
                  return { lat: snappedWp.latLng.lat, lng: ((v + 180) % 360 + 360) % 360 - 180 };
                }
              };
              return Object.assign({}, snappedWp, { latLng: reoffsetLatLng });
            });
          }
          // Re-project the route polyline into the same world copy as the waypoints
          // so LRM draws the line at the correct map position and fitBounds() doesn't
          // jump the viewport to the wrapped world copy (which would hide the markers).
          if (route && route.coordinates && coordOffset !== 0) {
            route.coordinates = route.coordinates.map(function(coord) {
              if (!coord) return coord;
              return { lat: coord.lat, lng: coord.lng + coordOffset };
            });
          }
        });
      }
      if (typeof callback === 'function') callback.apply(context || callback, arguments);
    };

    var xhr = origRoute(wrapped, wrappedCallback, context, options);
    router._lastXhr = xhr;
    return xhr;
  };
}

module.exports = {
  applyPatches: function(router) {
    router._leftOrRight = leftOrRight;
    wrapWaypoints(router);
  },
  // Exported for unit testing
  leftOrRight: leftOrRight,
  wrapWaypoints: wrapWaypoints,
  
  // Allow setting the active service by index
  setActiveService: function(router, serviceIndex, services) {
    if (serviceIndex >= 0 && serviceIndex < services.length) {
      var service = services[serviceIndex];
      router.options.serviceUrl = service.path;
      if (service.profile) {
        router.options.profile = service.profile;
      }
    }
  }
};
