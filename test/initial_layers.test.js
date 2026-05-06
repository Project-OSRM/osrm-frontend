'use strict';

var initialLayers = require('../src/initial_layers');

var baselayer = { _url: 'https://tiles.example.com/{z}/{x}/{y}.png' };
var overlay = {
  'Hiking': { _url: 'https://hiking.example.com/{z}/{x}/{y}.png' },
  'Bike': { _url: 'https://bike.example.com/{z}/{x}/{y}.png' },
  'Small Components': { _url: 'https://small.example.com/{z}/{x}/{y}.png' }
};
var services = [
  { label: 'Car', path: 'https://car.example.com/route/v1', profile: 'driving' },
  { label: 'Bike', path: 'https://bike.example.com/route/v1', profile: 'bike' },
  { label: 'Foot', path: 'https://foot.example.com/route/v1', profile: 'foot' }
];

describe('determineInitialLayers', function() {
  it('should show Bike overlay when profile is bike', function() {
    var result = initialLayers.determineInitialLayers(baselayer, overlay, services, 1, false);
    expect(result.layers).toEqual([baselayer, overlay['Bike']]);
    expect(result.bikeOverlayAutoActivated).toBe(true);
  });

  it('should show Bike overlay when profile is bike even if stored overlay is true', function() {
    var result = initialLayers.determineInitialLayers(baselayer, overlay, services, 1, true);
    expect(result.layers).toEqual([baselayer, overlay['Bike']]);
    expect(result.bikeOverlayAutoActivated).toBe(true);
  });

  it('should show Small Components when non-bike profile and stored overlay is true', function() {
    var result = initialLayers.determineInitialLayers(baselayer, overlay, services, 0, true);
    expect(result.layers).toEqual([baselayer, overlay['Small Components']]);
    expect(result.bikeOverlayAutoActivated).toBe(false);
  });

  it('should show only baselayer when non-bike profile and no stored overlay', function() {
    var result = initialLayers.determineInitialLayers(baselayer, overlay, services, 0, false);
    expect(result.layers).toEqual([baselayer]);
    expect(result.bikeOverlayAutoActivated).toBe(false);
  });

  it('should show only baselayer for foot profile without stored overlay', function() {
    var result = initialLayers.determineInitialLayers(baselayer, overlay, services, 2, false);
    expect(result.layers).toEqual([baselayer]);
    expect(result.bikeOverlayAutoActivated).toBe(false);
  });

  it('should show Small Components for foot profile with stored overlay', function() {
    var result = initialLayers.determineInitialLayers(baselayer, overlay, services, 2, true);
    expect(result.layers).toEqual([baselayer, overlay['Small Components']]);
    expect(result.bikeOverlayAutoActivated).toBe(false);
  });

  it('should fall back to baselayer for invalid profile index', function() {
    var result = initialLayers.determineInitialLayers(baselayer, overlay, services, 99, false);
    expect(result.layers).toEqual([baselayer]);
    expect(result.bikeOverlayAutoActivated).toBe(false);
  });

  it('should show Small Components for invalid profile index with stored overlay', function() {
    var result = initialLayers.determineInitialLayers(baselayer, overlay, services, 99, true);
    expect(result.layers).toEqual([baselayer, overlay['Small Components']]);
    expect(result.bikeOverlayAutoActivated).toBe(false);
  });
});
