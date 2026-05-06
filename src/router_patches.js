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
function wrapWaypoints(router) {
  var origRoute = router.route.bind(router);
  router.route = function(waypoints, callback, context, options) {
    var wrapped = (waypoints || []).map(function(wp) {
      if (!wp || !wp.latLng || typeof wp.latLng.wrap !== 'function') return wp;
      return Object.assign({}, wp, { latLng: wp.latLng.wrap() });
    });
    return origRoute(wrapped, callback, context, options);
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
