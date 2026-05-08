'use strict';

module.exports = function createLocationFoundHandler(map, lrmControl) {
  return function(e) {
    try {
      var latlng = e && e.latlng ? e.latlng : null;
      if (!latlng) return;
      var hasRoute = false;
      if (lrmControl) {
        if (Array.isArray(lrmControl._routes) && lrmControl._routes.length > 0) hasRoute = true;
        if (typeof lrmControl._selectedRoute !== 'undefined' && lrmControl._selectedRoute !== null) hasRoute = true;
      }
      if (!hasRoute) {
        map.setView(latlng, 14);
      }
    } catch (err) {
      console.error('Error in locationfound handler:', err);
    }
  };
};