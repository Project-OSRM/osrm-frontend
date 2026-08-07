'use strict';

var routeZoom = require('../src/route_zoom');

describe('route_zoom', function() {
  test('combines coordinates from all returned routes', function() {
    var primary = [{lat: 1, lng: 1}, {lat: 2, lng: 2}];
    var alternative = [{lat: 10, lng: 10}, {lat: 20, lng: 20}];
    var combined = routeZoom.getBoundsCoordinates([
      {coordinates: primary},
      {coordinates: alternative}
    ]);

    expect(combined).toEqual(primary.concat(alternative));
  });

  test('falls back to selected route when route list is unavailable', function() {
    var selected = [{lat: 5, lng: 5}, {lat: 6, lng: 6}];
    var combined = routeZoom.getBoundsCoordinates(null, {coordinates: selected});

    expect(combined).toEqual(selected);
  });

  test('ignores routes without coordinate arrays', function() {
    var valid = [{lat: 3, lng: 3}];
    var combined = routeZoom.getBoundsCoordinates([
      {},
      {coordinates: []},
      {coordinates: valid}
    ]);

    expect(combined).toEqual(valid);
  });
});

describe('route running under the directions pane', function() {
  var mapSize = {x: 1000, y: 600};
  var paneWidth = 300;

  test('reports covered when the whole route sits under the pane', function() {
    var underPane = [{x: 750, y: 100}, {x: 900, y: 400}];

    expect(routeZoom.isRouteUnderPane(underPane, mapSize, paneWidth)).toBe(true);
  });

  test('reports covered when a single route point reaches under the pane', function() {
    var mostlyClear = [{x: 100, y: 100}, {x: 400, y: 200}, {x: 701, y: 400}];

    expect(routeZoom.isRouteUnderPane(mostlyClear, mapSize, paneWidth)).toBe(true);
  });

  test('reports clear when the whole route stays left of the pane', function() {
    var clear = [{x: 100, y: 100}, {x: 699, y: 400}];

    expect(routeZoom.isRouteUnderPane(clear, mapSize, paneWidth)).toBe(false);
  });

  test('reports clear when the pane is hidden', function() {
    var underPane = [{x: 750, y: 100}, {x: 900, y: 400}];

    expect(routeZoom.isRouteUnderPane(underPane, mapSize, 0)).toBe(false);
  });

  test('ignores points that pass the pane above or below the viewport', function() {
    var pastPaneOffScreen = [{x: 800, y: -50}, {x: 900, y: 650}];

    expect(routeZoom.isRouteUnderPane(pastPaneOffScreen, mapSize, paneWidth)).toBe(false);
  });

  test('reports covered when the pane covers the whole map', function() {
    var anywhere = [{x: 100, y: 100}];

    expect(routeZoom.isRouteUnderPane(anywhere, {x: 280, y: 600}, 300)).toBe(true);
  });

  test('reports clear without route points to judge', function() {
    expect(routeZoom.isRouteUnderPane([], mapSize, paneWidth)).toBe(false);
    expect(routeZoom.isRouteUnderPane(null, mapSize, paneWidth)).toBe(false);
  });

  test('counts a point on the pane edge as clear', function() {
    var onEdge = [{x: 700, y: 300}];

    expect(routeZoom.isRouteUnderPane(onEdge, mapSize, paneWidth)).toBe(false);
  });
});

describe('route fit tracker', function() {
  test('requests a fit for routes that follow a clicked waypoint', function() {
    var tracker = routeZoom.createRouteFitTracker();

    tracker.waypointPlaced();
    tracker.routesFound();

    expect(tracker.isFitPending()).toBe(true);
  });

  test('starts without a pending fit', function() {
    expect(routeZoom.createRouteFitTracker().isFitPending()).toBe(false);
  });

  test('suppresses the fit for routes computed during a waypoint drag', function() {
    var tracker = routeZoom.createRouteFitTracker();

    tracker.waypointDragStarted();
    tracker.routesFound();

    expect(tracker.isFitPending()).toBe(false);
  });

  test('keeps the previous fit request cleared while dragging repeatedly', function() {
    var tracker = routeZoom.createRouteFitTracker();

    tracker.waypointDragStarted();
    tracker.routesFound();
    tracker.waypointDragStarted();
    tracker.routesFound();

    expect(tracker.isFitPending()).toBe(false);
  });

  test('fits again on the first route after a drag finished', function() {
    var tracker = routeZoom.createRouteFitTracker();

    tracker.waypointDragStarted();
    tracker.routesFound();
    tracker.routesFound();

    expect(tracker.isFitPending()).toBe(true);
  });

  test('clears the pending fit once it has been applied', function() {
    var tracker = routeZoom.createRouteFitTracker();

    tracker.routesFound();
    tracker.clearFitPending();

    expect(tracker.isFitPending()).toBe(false);
  });

  test('does not carry a failed drag over to the next clicked waypoint', function() {
    var tracker = routeZoom.createRouteFitTracker();

    tracker.waypointDragStarted();
    tracker.routingFailed();
    tracker.routesFound();

    expect(tracker.isFitPending()).toBe(true);
  });

  test('does not carry an unfinished drag over to the next clicked waypoint', function() {
    var tracker = routeZoom.createRouteFitTracker();

    tracker.waypointDragStarted();
    tracker.waypointPlaced();
    tracker.routesFound();

    expect(tracker.isFitPending()).toBe(true);
  });

  test('centers a geocoded waypoint that no drag produced', function() {
    expect(routeZoom.createRouteFitTracker().waypointGeocoded()).toBe(true);
  });

  test('does not center the reverse geocode that follows a drag', function() {
    var tracker = routeZoom.createRouteFitTracker();

    tracker.waypointDragStarted();

    expect(tracker.waypointGeocoded()).toBe(false);
  });

  test('centers again on the geocode after the one a drag produced', function() {
    var tracker = routeZoom.createRouteFitTracker();

    tracker.waypointDragStarted();
    tracker.waypointGeocoded();

    expect(tracker.waypointGeocoded()).toBe(true);
  });

  test('does not center a waypoint dragged after the route was found', function() {
    var tracker = routeZoom.createRouteFitTracker();

    tracker.waypointDragStarted();
    tracker.routesFound();

    expect(tracker.waypointGeocoded()).toBe(false);
  });

  test('suppresses the fit for a drag whose geocode arrived first', function() {
    var tracker = routeZoom.createRouteFitTracker();

    tracker.waypointDragStarted();
    tracker.waypointGeocoded();
    tracker.routesFound();

    expect(tracker.isFitPending()).toBe(false);
  });

  test('centers a clicked waypoint after an unfinished drag', function() {
    var tracker = routeZoom.createRouteFitTracker();

    tracker.waypointDragStarted();
    tracker.waypointPlaced();

    expect(tracker.waypointGeocoded()).toBe(true);
  });
});
