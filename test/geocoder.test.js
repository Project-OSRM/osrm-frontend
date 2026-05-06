'use strict';

// Longitude-wrapping helper used in mocks — mirrors Leaflet's LatLng.wrap().
function wrapLng(v) {
  return ((v + 180) % 360 + 360) % 360 - 180;
}

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
      latLng: (lat, lng) => {
        const obj = { lat: +lat, lng: +lng, toBounds: () => ({}) };
        obj.wrap = () => ({ lat: obj.lat, lng: wrapLng(obj.lng), toBounds: () => ({}) });
        return obj;
      },
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
      latLng: (lat, lng) => {
        const obj = { lat: +lat, lng: +lng, toBounds: () => ({}) };
        obj.wrap = () => ({ lat: obj.lat, lng: wrapLng(obj.lng), toBounds: () => ({}) });
        return obj;
      },
      extend: Object.assign
    }));

    const geocoder = require('../src/geocoder');
    const L = require('leaflet');

    // Call without argument to ensure default nominatim factory is used
    geocoder.coordPreserving();
    expect(L.Control.Geocoder.nominatim).toHaveBeenCalled();
    expect(L.Control.Geocoder.nominatim.mock.calls[0].length).toBe(0);
  });

  // Tests for reverse-geocode coordinate wrapping (issues #206, #307).
  // When the map is scrolled past the antimeridian, marker latLngs can have
  // out-of-range longitudes.  doReverse() must wrap them before calling
  // Nominatim so the request succeeds.
  describe('reverse geocoding wraps out-of-range longitudes', () => {
    function makeMocks(reverseMockImpl) {
      const reverseMock = jest.fn(reverseMockImpl || (() => Promise.resolve([{ name: 'wrapped-result' }])));
      const geocodeMock = jest.fn(() => Promise.resolve([]));
      const nominatimFactory = jest.fn(() => ({ reverse: reverseMock, geocode: geocodeMock }));
      jest.doMock('leaflet', () => ({
        Control: { Geocoder: { nominatim: nominatimFactory } },
        CRS: { EPSG3857: { scale: () => 1 } },
        latLng: (lat, lng) => {
          const obj = { lat: +lat, lng: +lng, toBounds: () => ({}) };
          obj.wrap = () => ({ lat: obj.lat, lng: wrapLng(obj.lng), toBounds: () => ({}) });
          return obj;
        },
        extend: Object.assign
      }));
      return { reverseMock, geocodeMock, nominatimFactory };
    }

    test('passes wrapped longitude to nominatim.reverse when lng < -180', async () => {
      const { reverseMock } = makeMocks();
      const geocoder = require('../src/geocoder');
      const g = geocoder.coordPreserving('https://nominatim.example/');

      const outOfRange = { lat: 53.265, lng: -362.806, wrap: () => ({ lat: 53.265, lng: -2.806 }) };
      await g.reverse(outOfRange, 1, function() {});

      expect(reverseMock).toHaveBeenCalledTimes(1);
      const calledWith = reverseMock.mock.calls[0][0];
      expect(calledWith.lng).toBeCloseTo(-2.806);
      expect(calledWith.lat).toBeCloseTo(53.265);
    });

    test('passes wrapped longitude to nominatim.reverse when lng > +180', async () => {
      const { reverseMock } = makeMocks();
      const geocoder = require('../src/geocoder');
      const g = geocoder.coordPreserving('https://nominatim.example/');

      const outOfRange = { lat: 39.9, lng: 1556.6, wrap: () => ({ lat: 39.9, lng: 116.6 }) };
      await g.reverse(outOfRange, 1, function() {});

      expect(reverseMock).toHaveBeenCalledTimes(1);
      const calledWith = reverseMock.mock.calls[0][0];
      expect(calledWith.lng).toBeCloseTo(116.6);
    });

    test('does not alter longitudes already in [-180, 180]', async () => {
      const { reverseMock } = makeMocks();
      const geocoder = require('../src/geocoder');
      const g = geocoder.coordPreserving('https://nominatim.example/');

      const inRange = { lat: 48.8, lng: 2.35, wrap: () => ({ lat: 48.8, lng: 2.35 }) };
      await g.reverse(inRange, 1, function() {});

      const calledWith = reverseMock.mock.calls[0][0];
      expect(calledWith.lng).toBeCloseTo(2.35);
    });

    test('re-offsets result center back to original coordinate space when lng < -180', async () => {
      // LRM's geocoder-element checks rs[0].center.distanceTo(wp.latLng).
      // If center stays at the wrapped lng while wp.latLng is out-of-range, the
      // distance test fails and LRM falls back to showing raw coordinates.
      const { nominatimFactory } = makeMocks(
        () => Promise.resolve([{ name: 'Berlin', center: { lat: 52.5, lng: 13.405 } }])
      );

      jest.doMock('leaflet', () => ({
        Control: { Geocoder: { nominatim: nominatimFactory } },
        CRS: { EPSG3857: { scale: () => 1 } },
        latLng: (lat, lng) => {
          const obj = { lat: +lat, lng: +lng, toBounds: () => ({}) };
          obj.wrap = () => ({ lat: obj.lat, lng: wrapLng(obj.lng), toBounds: () => ({}) });
          return obj;
        },
        latLngBounds: () => ({}),
        extend: Object.assign
      }));

      const geocoder = require('../src/geocoder');
      const g = geocoder.coordPreserving('https://nominatim.example/');

      // Panned west two full turns: 13.405 - 720 = -706.595
      const outOfRange = { lat: 52.5, lng: -706.595, wrap: () => ({ lat: 52.5, lng: 13.405 }) };
      const results = await g.reverse(outOfRange, 1, function() {});
      // center.lng should be re-offset by -720 (two full rotations west)
      expect(results[0].center.lng).toBeCloseTo(-706.595);
    });

    test('re-offsets result center back to original coordinate space when lng > +180', async () => {
      const { nominatimFactory } = makeMocks(
        () => Promise.resolve([{ name: 'Beijing', center: { lat: 39.9, lng: 116.403 } }])
      );

      jest.doMock('leaflet', () => ({
        Control: { Geocoder: { nominatim: nominatimFactory } },
        CRS: { EPSG3857: { scale: () => 1 } },
        latLng: (lat, lng) => {
          const obj = { lat: +lat, lng: +lng, toBounds: () => ({}) };
          obj.wrap = () => ({ lat: obj.lat, lng: wrapLng(obj.lng), toBounds: () => ({}) });
          return obj;
        },
        latLngBounds: () => ({}),
        extend: Object.assign
      }));

      const geocoder = require('../src/geocoder');
      const g = geocoder.coordPreserving('https://nominatim.example/');

      // Panned east four full turns: 116.403 + 1440 = 1556.403
      const outOfRange = { lat: 39.9, lng: 1556.403, wrap: () => ({ lat: 39.9, lng: 116.403 }) };
      const results = await g.reverse(outOfRange, 1, function() {});
      expect(results[0].center.lng).toBeCloseTo(1556.403);
    });

    test('leaves result center unchanged when input is already in [-180, 180]', async () => {
      const { nominatimFactory } = makeMocks(
        () => Promise.resolve([{ name: 'Paris', center: { lat: 48.85, lng: 2.347 } }])
      );

      jest.doMock('leaflet', () => ({
        Control: { Geocoder: { nominatim: nominatimFactory } },
        CRS: { EPSG3857: { scale: () => 1 } },
        latLng: (lat, lng) => {
          const obj = { lat: +lat, lng: +lng, toBounds: () => ({}) };
          obj.wrap = () => ({ lat: obj.lat, lng: wrapLng(obj.lng), toBounds: () => ({}) });
          return obj;
        },
        latLngBounds: () => ({}),
        extend: Object.assign
      }));

      const geocoder = require('../src/geocoder');
      const g = geocoder.coordPreserving('https://nominatim.example/');

      const inRange = { lat: 48.85, lng: 2.35, wrap: () => ({ lat: 48.85, lng: 2.35 }) };
      const results = await g.reverse(inRange, 1, function() {});
      // No re-offset — center stays as Nominatim returned it
      expect(results[0].center.lng).toBeCloseTo(2.347);
    });
  });
});
