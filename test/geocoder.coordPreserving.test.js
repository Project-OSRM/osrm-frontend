/* @jest-environment jsdom */
const L = require('leaflet');
const geocoderModule = require('../src/geocoder');

describe('coordPreserving geocoder', () => {
  beforeEach(() => {
    // Provide a nominatim stub that returns Promises
    L.Control = L.Control || {};
    L.Control.Geocoder = L.Control.Geocoder || {};
    L.Control.Geocoder.nominatim = jest.fn(({serviceUrl} = {}) => ({
      geocode: jest.fn((q) => Promise.resolve([{ name: 'Forward: ' + q, center: L.latLng(1, 2) }])),
      reverse: jest.fn((latlng, scale) => Promise.resolve([{ name: 'Reverse at ' + latlng.lat + ',' + latlng.lng }]))
    }));
  });

  test('geocode returns exact latlng for coordinate input and preserves reverse result name', async () => {
    const g = geocoderModule.coordPreserving('https://nominatim.example/');
    const res = await g.geocode('12.34,56.78');
    expect(Array.isArray(res)).toBe(true);
    expect(res.length).toBeGreaterThan(0);
    const r = res[0];
    expect(r.center.lat).toBeCloseTo(12.34, 6);
    expect(r.center.lng).toBeCloseTo(56.78, 6);
    expect(r.name).toMatch(/Reverse at/);
  });

  test('suggest returns exact latlng for coordinate input', async () => {
    const g = geocoderModule.coordPreserving();
    const res = await g.suggest(' -12.5  100.25 ');
    expect(res[0].center.lat).toBeCloseTo(-12.5, 6);
    expect(res[0].center.lng).toBeCloseTo(100.25, 6);
  });

  test('non-coordinate input falls back to nominatim.geocode', async () => {
    const g = geocoderModule.coordPreserving();
    const res = await g.geocode('Some place');
    expect(res[0].name).toMatch(/^Forward: Some place/);
  });
});
