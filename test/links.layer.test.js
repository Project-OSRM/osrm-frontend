'use strict';

// Mock leaflet and leaflet-routing-machine so tests run in Node without a DOM.
// The latLng mock includes wrap() so _formatCoord's wrapping logic is exercised.
jest.mock('leaflet', () => ({
  latLng: function(lat, lng) {
    var obj = { lat: lat, lng: lng };
    obj.wrap = function() {
      // Inline Leaflet's wrapNum(lng, [-180, 180], true) without referencing
      // out-of-scope variables (jest.mock hoisting restriction).
      var v = obj.lng;
      var wrapped = ((v + 180) % 360 + 360) % 360 - 180;
      return { lat: obj.lat, lng: wrapped };
    };
    return obj;
  },
  Routing: {
    waypoint: function(latlng, name) { return { latLng: latlng, name: name || '' }; }
  }
}));
jest.mock('jsonp', () => {});

const links = require('../src/links');
const L = require('leaflet');

describe('links.format — layer param (ly)', () => {
  test('includes ly when given a layer name string', () => {
    const output = links.format({
      zoom: 13,
      center: L.latLng(52.5, 13.4),
      waypoints: [],
      language: 'en',
      layer: 'Streets'
    });
    expect(output).toContain('ly=Streets');
  });

  test('includes ly when given a layer object with label', () => {
    const output = links.format({
      zoom: 13,
      center: L.latLng(52.5, 13.4),
      waypoints: [],
      language: 'en',
      layer: { label: 'Satellite' }
    });
    expect(output).toContain('ly=Satellite');
  });

  test('falls back to default layer name when layer missing', () => {
    const output = links.format({
      zoom: 13,
      center: L.latLng(52.5, 13.4),
      waypoints: [],
      language: 'en'
    });
    expect(output).toContain('ly=Streets');
  });
});
