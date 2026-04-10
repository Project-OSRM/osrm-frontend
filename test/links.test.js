'use strict';

// Mock leaflet and leaflet-routing-machine so tests run in Node without a DOM
jest.mock('leaflet', () => ({
  latLng: function(lat, lng) { return { lat: lat, lng: lng }; },
  Routing: {
    waypoint: function(latlng, name) { return { latLng: latlng, name: name || '' }; }
  }
}));
jest.mock('jsonp', () => {});

const links = require('../src/links');

describe('links.parse — dst/src address parameters', () => {
  test('parses ?dst into destinationAddress', () => {
    const result = links.parse('dst=Berlin');
    expect(result.destinationAddress).toBe('Berlin');
  });

  test('parses ?src into originAddress', () => {
    const result = links.parse('src=Paris');
    expect(result.originAddress).toBe('Paris');
  });

  test('parses both ?src and ?dst together', () => {
    const result = links.parse('src=Paris&dst=Berlin');
    expect(result.originAddress).toBe('Paris');
    expect(result.destinationAddress).toBe('Berlin');
  });

  test('parses address strings with spaces and special characters', () => {
    const result = links.parse('dst=New%20York%2C%20NY');
    expect(result.destinationAddress).toBe('New York, NY');
  });

  test('returns undefined originAddress when src is absent', () => {
    const result = links.parse('dst=Berlin');
    expect(result.originAddress).toBeUndefined();
  });

  test('returns undefined destinationAddress when dst is absent', () => {
    const result = links.parse('src=Paris');
    expect(result.destinationAddress).toBeUndefined();
  });

  test('dst/src absent from result when empty string', () => {
    const result = links.parse('dst=&src=');
    // Empty strings are filtered out by the existing options filtering logic
    expect(result.destinationAddress).toBeUndefined();
    expect(result.originAddress).toBeUndefined();
  });
});

describe('links.format — dst/src are not serialized', () => {
  test('formatLink does not include dst in output', () => {
    const L = require('leaflet');
    const output = links.format({
      zoom: 13,
      center: L.latLng(52.5, 13.4),
      waypoints: [],
      language: 'en',
      destinationAddress: 'Berlin',
      originAddress: 'Paris'
    });
    expect(output).not.toContain('dst=');
    expect(output).not.toContain('src=');
  });
});

describe('links.parse — existing loc= params still work', () => {
  test('parses loc= coordinate pairs normally', () => {
    const result = links.parse('loc=52.5,13.4&loc=48.8,2.3');
    expect(result.waypoints).toHaveLength(2);
    expect(result.waypoints[0].latLng.lat).toBeCloseTo(52.5);
    expect(result.waypoints[1].latLng.lat).toBeCloseTo(48.8);
  });

  test('dst and src are parsed alongside loc= without conflict', () => {
    const result = links.parse('loc=52.5,13.4&loc=48.8,2.3&dst=Lyon');
    expect(result.waypoints).toHaveLength(2);
    expect(result.destinationAddress).toBe('Lyon');
  });
});
