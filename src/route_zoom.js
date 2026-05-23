'use strict';

function getBoundsCoordinates(routes, fallbackRoute) {
  var sourceRoutes = Array.isArray(routes) && routes.length ? routes : [fallbackRoute];
  var coordinates = [];

  sourceRoutes.forEach(function(route) {
    var routeCoordinates = route && Array.isArray(route.coordinates) ? route.coordinates : null;
    if (routeCoordinates && routeCoordinates.length) {
      for (var i = 0; i < routeCoordinates.length; i++) {
        coordinates.push(routeCoordinates[i]);
      }
    }
  });

  return coordinates;
}

module.exports = {
  getBoundsCoordinates: getBoundsCoordinates
};
