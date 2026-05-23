'use strict';

function getBoundsCoordinates(routes, fallbackRoute) {
  var sourceRoutes = Array.isArray(routes) && routes.length ? routes : [fallbackRoute];
  var coordinates = [];

  sourceRoutes.forEach(function(route) {
    if (route && Array.isArray(route.coordinates) && route.coordinates.length) {
      coordinates = coordinates.concat(route.coordinates);
    }
  });

  return coordinates;
}

module.exports = {
  getBoundsCoordinates: getBoundsCoordinates
};
