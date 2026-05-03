'use strict';

describe('geocoder.coordPreserving', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('passes serviceUrl to nominatim and preserves exact coordinates for coordinate input', async () => {
    const reverseMock = jest.fn(() => Promise.resolve([{ name: 'nom-res', center: { lat: 99, lng: 88 } }]));
    const geocodeMock = jest.fn(() => Promise.resolve([]));
    const nominatimFactory = jest.fn(() => ({ reverse: reverseMock, geocode: geocodeMock }));

    jest.doMock('leaflet', () => ({
      Control: { Geocoder: { nominatim: nominatimFactory } },
      CRS: { EPSG3857: { scale: () => 1 } },
      latLng: (lat, lng) => ({ lat: +lat, lng: +lng, toBounds: () => ({}) }),
      extend: Object.assign
    }));

    const geocoder = require('../src/geocoder');
    const L = require('leaflet');

    const g = geocoder.coordPreserving('https://nominatim.example/');
    expect(L.Control.Geocoder.nominatim).toHaveBeenCalledWith({ serviceUrl: 'https://nominatim.example/' });

    const results = await g.geocode('34.129382,-118.141254');
    expect(results).toHaveLength(1);
    expect(results[0].center.lat).toBeCloseTo(34.129382);
    expect(results[0].center.lng).toBeCloseTo(-118.141254);
    expect(reverseMock).toHaveBeenCalled();
  });

  test('invokes L.Control.Geocoder.nominatim() with no args when nominatimUrl omitted', () => {
    const reverseMock = jest.fn(() => Promise.resolve([]));
    const geocodeMock = jest.fn(() => Promise.resolve([]));
    const nominatimFactory = jest.fn(() => ({ reverse: reverseMock, geocode: geocodeMock }));

    jest.doMock('leaflet', () => ({
      Control: { Geocoder: { nominatim: nominatimFactory } },
      CRS: { EPSG3857: { scale: () => 1 } },
      latLng: (lat, lng) => ({ lat: +lat, lng: +lng, toBounds: () => ({}) }),
      extend: Object.assign
    }));

    const geocoder = require('../src/geocoder');
    const L = require('leaflet');

    // Call without argument to ensure default nominatim factory is used
    geocoder.coordPreserving();
    expect(L.Control.Geocoder.nominatim).toHaveBeenCalled();
    expect(L.Control.Geocoder.nominatim.mock.calls[0].length).toBe(0);
  });
});
