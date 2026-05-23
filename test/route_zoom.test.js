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
