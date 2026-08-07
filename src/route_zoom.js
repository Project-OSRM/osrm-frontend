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

// Reports whether any part of the route runs into the directions pane. The route
// must never disappear underneath the pane, so a drag that pushes it there still
// refits the view even though drags otherwise leave the view alone.
//
// containerPoints are the route coordinates projected to container pixels,
// mapSize is the map's pixel size, paneWidth the width of the directions pane
// on the right edge (0 when the pane is hidden). A point counts as covered when
// it lies right of the pane's left edge and within the viewport vertically.
function isRouteUnderPane(containerPoints, mapSize, paneWidth) {
  if (!containerPoints || !containerPoints.length) return false;
  if (!mapSize || !paneWidth || paneWidth <= 0) return false;

  var paneLeft = mapSize.x - paneWidth;

  for (var i = 0; i < containerPoints.length; i++) {
    var point = containerPoints[i];
    if (!point) continue;
    if (point.x > paneLeft && point.y >= 0 && point.y <= mapSize.y) {
      return true;
    }
  }

  return false;
}

// Tracks whether the map view should follow waypoint changes.
// Dragging a marker must leave the view untouched: neither the recomputed route
// nor the reverse geocode that follows the drag may move the map. Only waypoints
// placed by a click (or typed into the geocoder) refit or recenter the view.
//
// A drag triggers a route request and a reverse geocode independently, and their
// results can arrive in either order, so each is tracked with its own flag and
// cleared by the result it belongs to.
function createRouteFitTracker() {
  var routeRequestFromDrag = false;
  var geocodeFromDrag = false;
  var fitPending = false;

  return {
    waypointDragStarted: function() {
      routeRequestFromDrag = true;
      geocodeFromDrag = true;
    },
    waypointPlaced: function() {
      routeRequestFromDrag = false;
      geocodeFromDrag = false;
    },
    routesFound: function() {
      fitPending = !routeRequestFromDrag;
      routeRequestFromDrag = false;
    },
    routingFailed: function() {
      routeRequestFromDrag = false;
    },
    // Reports whether the geocoded waypoint should be centered, and consumes the
    // drag state so a later typed geocode recenters as usual.
    waypointGeocoded: function() {
      var shouldPan = !geocodeFromDrag;
      geocodeFromDrag = false;
      return shouldPan;
    },
    isFitPending: function() {
      return fitPending;
    },
    clearFitPending: function() {
      fitPending = false;
    }
  };
}

module.exports = {
  getBoundsCoordinates: getBoundsCoordinates,
  isRouteUnderPane: isRouteUnderPane,
  createRouteFitTracker: createRouteFitTracker
};
