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

// Insets describe the part of the full map covered by the directions pane.
// Numeric values retain compatibility with the classic right-side pane.
function normalizePaneInsets(value) {
  if (typeof value === 'number') return { left: 0, right: value, top: 0, bottom: 0 };
  return Object.assign({ left: 0, right: 0, top: 0, bottom: 0 }, value);
}

function getPaneInsets(mapSize, paneSize, themed) {
  var insets = normalizePaneInsets();
  if (!paneSize || !paneSize.width || !paneSize.height) return insets;
  if (themed && paneSize.width >= mapSize.x - 1) insets.bottom = Math.min(paneSize.height, mapSize.y);
  else if (themed) insets.left = Math.min(paneSize.width, mapSize.x);
  else insets.right = Math.min(paneSize.width, mapSize.x);
  return insets;
}

function isRouteUnderPane(containerPoints, mapSize, paneInsets) {
  if (!containerPoints || !containerPoints.length || !mapSize) return false;
  var insets = normalizePaneInsets(paneInsets);
  return containerPoints.some(function(point) {
    if (!point || point.x < 0 || point.x > mapSize.x || point.y < 0 || point.y > mapSize.y) return false;
    return point.x < insets.left || point.x > mapSize.x - insets.right ||
      point.y < insets.top || point.y > mapSize.y - insets.bottom;
  });
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
  var fitSuppression;
  var geocodeFromDrag = false;
  var fitPending = false;
  var selectionFromDrag = false;
  var preserveViewDuringDrag = false;

  return {
    waypointDragStarted: function(preserveView) {
      preserveViewDuringDrag = preserveView === true;
      fitSuppression = preserveViewDuringDrag ? 'drag' : 'update';
      geocodeFromDrag = true;
    },
    waypointDragEnded: function() {
      // A route already in flight can consume the drag flag before the drop.
      if (preserveViewDuringDrag) fitSuppression = 'drag';
      preserveViewDuringDrag = false;
    },
    // Reordering from the panel is a rearrangement of places the user has
    // already put on the map, so the view stays put like it does for a drag.
    // No reverse geocode follows (the names travel with the waypoints), so
    // only the route request is marked; marking the geocode too would swallow
    // the pan of the next typed address.
    waypointsReordered: function() {
      fitSuppression = 'update';
    },
    waypointPlaced: function() {
      fitSuppression = undefined;
      preserveViewDuringDrag = false;
      geocodeFromDrag = false;
    },
    routesFound: function() {
      fitPending = !fitSuppression;
      selectionFromDrag = fitSuppression === 'drag';
      fitSuppression = undefined;
    },
    routingFailed: function() {
      fitSuppression = undefined;
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
    isSelectionFromDrag: function() {
      return selectionFromDrag;
    },
    clearFitPending: function() {
      fitPending = false;
      selectionFromDrag = false;
    }
  };
}

module.exports = {
  getBoundsCoordinates: getBoundsCoordinates,
  normalizePaneInsets: normalizePaneInsets,
  getPaneInsets: getPaneInsets,
  isRouteUnderPane: isRouteUnderPane,
  createRouteFitTracker: createRouteFitTracker
};
