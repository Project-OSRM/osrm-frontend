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

  test('ignores points that lie off screen to the right of the pane', function() {
    var pastRightEdge = [{x: 1200, y: 300}, {x: 4000, y: 100}];

    expect(routeZoom.isRouteUnderPane(pastRightEdge, mapSize, paneWidth)).toBe(false);
  });

  test('reports covered for a route that leaves the viewport through the pane', function() {
    var acrossPaneAndOut = [{x: 400, y: 300}, {x: 850, y: 300}, {x: 1200, y: 300}];

    expect(routeZoom.isRouteUnderPane(acrossPaneAndOut, mapSize, paneWidth)).toBe(true);
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

  test('suppresses the fit for the route that follows a reorder', function() {
    var tracker = routeZoom.createRouteFitTracker();

    tracker.waypointsReordered();
    tracker.routesFound();

    expect(tracker.isFitPending()).toBe(false);
  });

  test('fits again on the first route after a reorder', function() {
    var tracker = routeZoom.createRouteFitTracker();

    tracker.waypointsReordered();
    tracker.routesFound();
    tracker.routesFound();

    expect(tracker.isFitPending()).toBe(true);
  });

  var placedWaypoints = [{latLng: {lat: 1, lng: 2}}, {latLng: {lat: 3, lng: 4}}];

  test('suppresses the fit for the route that follows an approach change', function() {
    var tracker = routeZoom.createRouteFitTracker();

    tracker.waypointApproachChanged(placedWaypoints);
    tracker.routesFound();

    expect(tracker.isFitPending()).toBe(false);
  });

  test('an approach change does not swallow the pan of the next typed address', function() {
    var tracker = routeZoom.createRouteFitTracker();

    tracker.waypointApproachChanged(placedWaypoints);

    expect(tracker.waypointGeocoded()).toBe(true);
  });

  test('fits again on the first route after an approach change', function() {
    var tracker = routeZoom.createRouteFitTracker();

    tracker.waypointApproachChanged(placedWaypoints);
    tracker.routesFound();
    tracker.routesFound();

    expect(tracker.isFitPending()).toBe(true);
  });

  test('an approach change on a plan with an empty slot does not suppress the next fit', function() {
    var tracker = routeZoom.createRouteFitTracker();

    tracker.waypointApproachChanged([{latLng: {lat: 1, lng: 2}}, {latLng: null}]);
    tracker.routesFound();

    expect(tracker.isFitPending()).toBe(true);
  });

  test('an approach change on a single waypoint does not suppress the next fit', function() {
    var tracker = routeZoom.createRouteFitTracker();

    tracker.waypointApproachChanged([{latLng: {lat: 1, lng: 2}}]);
    tracker.routesFound();

    expect(tracker.isFitPending()).toBe(true);
  });

  test('an approach change on a fully placed plan with a via keeps the view', function() {
    var tracker = routeZoom.createRouteFitTracker();

    tracker.waypointApproachChanged(placedWaypoints.concat([{latLng: {lat: 5, lng: 6}}]));
    tracker.routesFound();

    expect(tracker.isFitPending()).toBe(false);
  });

  test('a reorder does not swallow the pan of the next typed address', function() {
    var tracker = routeZoom.createRouteFitTracker();

    tracker.waypointsReordered();

    expect(tracker.waypointGeocoded()).toBe(true);
  });

  test('centers a clicked waypoint after an unfinished drag', function() {
    var tracker = routeZoom.createRouteFitTracker();

    tracker.waypointDragStarted();
    tracker.waypointPlaced();

    expect(tracker.waypointGeocoded()).toBe(true);
  });
});

describe('translucent overlay pane insets', () => {
  test('reserves the left sidebar while the map extends behind it', () => {
    const insets = routeZoom.getPaneInsets({ x: 1200, y: 800 }, { width: 360, height: 800 }, true);
    expect(insets).toEqual({ left: 360, right: 0, top: 0, bottom: 0 });
    expect(routeZoom.isRouteUnderPane([{ x: 200, y: 200 }], { x: 1200, y: 800 }, insets)).toBe(true);
    expect(routeZoom.isRouteUnderPane([{ x: 500, y: 200 }], { x: 1200, y: 800 }, insets)).toBe(false);
  });

  test('reserves the bottom sheet on mobile', () => {
    const insets = routeZoom.getPaneInsets({ x: 400, y: 800 }, { width: 400, height: 350 }, true);
    expect(insets).toEqual({ left: 0, right: 0, top: 0, bottom: 350 });
    expect(routeZoom.isRouteUnderPane([{ x: 200, y: 600 }], { x: 400, y: 800 }, insets)).toBe(true);
    expect(routeZoom.isRouteUnderPane([{ x: 200, y: 300 }], { x: 400, y: 800 }, insets)).toBe(false);
  });

  test('preserves classic right-pane padding and clears hidden pane padding', () => {
    expect(routeZoom.getPaneInsets({ x: 1200, y: 800 }, { width: 360, height: 800 }, false)).toEqual({ left: 0, right: 360, top: 0, bottom: 0 });
    expect(routeZoom.getPaneInsets({ x: 1200, y: 800 }, null, true)).toEqual({ left: 0, right: 0, top: 0, bottom: 0 });
  });
});

describe('route fit padding', () => {
  const pins = require('../src/waypoint_marker').mapMarkerInsets();

  test('reserves the full pin above the anchor and the left pane', () => {
    const padding = routeZoom.getRouteFitPadding({x: 1000, y: 760}, {left: 360}, pins);

    expect(padding).toEqual({paddingTopLeft: [395, 62], paddingBottomRight: [35, 20]});
  });

  test('accounts for floating controls and the directions sheet on mobile', () => {
    const padding = routeZoom.getRouteFitPadding({x: 390, y: 760}, {bottom: 420}, pins, {
      top: 56, right: 62, bottom: 452
    });

    expect(padding).toEqual({paddingTopLeft: [35, 118], paddingBottomRight: [97, 472]});
  });

  test('reduces the gap when the sheet leaves very little room', () => {
    const padding = routeZoom.getRouteFitPadding({x: 320, y: 600}, {bottom: 540}, pins, {
      top: 56, bottom: 572
    });

    expect(padding.paddingTopLeft[1]).toBeGreaterThanOrEqual(pins.top);
    expect(padding.paddingTopLeft[1] + padding.paddingBottomRight[1]).toBeLessThan(600);
  });

  test('skips the fit when there is no room for a pin', () => {
    expect(routeZoom.getRouteFitPadding({x: 320, y: 600}, {bottom: 580}, pins)).toBeNull();
  });

  test('measures visible controls relative to the map container', () => {
    function element(rect) {
      return {getBoundingClientRect: () => rect};
    }
    const container = element({top: 20, left: 10, right: 410, bottom: 780});
    container.ownerDocument = {
      querySelectorAll: () => [element({top: 32, left: 80, right: 280, bottom: 76, width: 200, height: 44})]
    };
    container.querySelectorAll = selector => selector.includes('layers') ? [
      element({top: 38, left: 348, right: 392, bottom: 82, width: 44, height: 44}),
      element({top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0})
    ] : [
      element({top: 500, left: 188, right: 410, bottom: 527, width: 222, height: 27}),
      element({top: 800, left: 10, right: 210, bottom: 825, width: 200, height: 25})
    ];

    expect(routeZoom.getRouteControlInsets(container)).toEqual({left: 0, right: 62, top: 56, bottom: 280});
  });
});
