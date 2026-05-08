'use strict';

module.exports = function createLocationFoundHandler(map, lrmControl) {
  return function(e) {
    try {
      var latlng = e && e.latlng ? e.latlng : null;
      if (!latlng) return;
      // Determine whether a route is present. Align with src/state.js which
      // treats a non-empty _routes array as the source of truth.
      var hasRoute = false;
      if (lrmControl && Array.isArray(lrmControl._routes) && lrmControl._routes.length > 0) {
        hasRoute = true;
      }

      if (!hasRoute) {
        map.setView(latlng, 14);
      }
    } catch (err) {
      console.error('Error in locationfound handler:', err);
    }
  };
};