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
  router.route = function(waypoints, callback, context, options) {
    var wrapped = (waypoints || []).map(function(wp) {
      if (!wp || !wp.latLng || typeof wp.latLng.wrap !== 'function') return wp;
      return Object.assign({}, wp, { latLng: wp.latLng.wrap() });
    });

    var wrappedCallback = function(err, routes) {
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
        });
      }
      if (typeof callback === 'function') callback.apply(context || callback, arguments);
    };

    return origRoute(wrapped, wrappedCallback, context, options);
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
