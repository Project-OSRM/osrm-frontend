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
    expect(L.Control.Geocoder.nominatim).toHaveBeenCalledWith({
      serviceUrl: 'https://nominatim.example/',
      geocodingQueryParams: { entrances: 1 },
      reverseQueryParams: { entrances: 1 }
    });

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
    // No serviceUrl, so leaflet-control-geocoder keeps its own default endpoint;
    // the entrance parameters are still requested.
    expect(L.Control.Geocoder.nominatim).toHaveBeenCalledWith({
      geocodingQueryParams: { entrances: 1 },
      reverseQueryParams: { entrances: 1 }
    });
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

describe('geocoder.wrappedWaypointNameFallback', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('wraps longitude > +180 before formatting', () => {
    const geocoder = require('../src/geocoder');
    const latLng = { lat: 39.9, lng: 1556.6, wrap: () => ({ lat: 39.9, lng: 116.6 }) };
    const result = geocoder.wrappedWaypointNameFallback(latLng);
    expect(result).toBe('N39.9, E116.6');
  });

  test('wraps longitude < -180 before formatting', () => {
    const geocoder = require('../src/geocoder');
    const latLng = { lat: 53.265, lng: -362.806, wrap: () => ({ lat: 53.265, lng: -2.806 }) };
    const result = geocoder.wrappedWaypointNameFallback(latLng);
    expect(result).toBe('N53.265, W2.806');
  });

  test('leaves in-range coordinates unchanged', () => {
    const geocoder = require('../src/geocoder');
    const latLng = { lat: 48.8, lng: 2.35, wrap: () => ({ lat: 48.8, lng: 2.35 }) };
    const result = geocoder.wrappedWaypointNameFallback(latLng);
    expect(result).toBe('N48.8, E2.35');
  });

  test('handles latLng without wrap() gracefully', () => {
    const geocoder = require('../src/geocoder');
    const latLng = { lat: 39.9, lng: 1556.6 }; // no .wrap()
    // Falls back to using the original (out-of-range) lng
    const result = geocoder.wrappedWaypointNameFallback(latLng);
    expect(result).toBe('N39.9, E1556.6');
  });

  test('uses S/W for negative lat/lng', () => {
    const geocoder = require('../src/geocoder');
    const latLng = { lat: -33.9, lng: -70.6, wrap: () => ({ lat: -33.9, lng: -70.6 }) };
    const result = geocoder.wrappedWaypointNameFallback(latLng);
    expect(result).toBe('S33.9, W70.6');
  });
});

// Nominatim 5.2+ returns a place's entrance nodes when asked for them. These
// must survive every path a result can take to the UI, or the entrance picker
// has nothing to offer.
describe('geocoder entrance handling', () => {
  const BER_ENTRANCES = [
    { osm_id: 9942967218, type: 'main', lat: '52.3636100', lon: '13.5100542' },
    { osm_id: 9959231437, type: 'main', lat: '52.3641971', lon: '13.5096892' }
  ];

  function mockLeaflet() {
    jest.doMock('leaflet', () => ({
      Control: { Geocoder: { nominatim: jest.fn(() => ({})) } },
      CRS: { EPSG3857: { scale: () => 1 } },
      latLng: (lat, lng) => {
        const obj = { lat: +lat, lng: +lng, toBounds: () => ({}) };
        obj.wrap = () => obj;
        return obj;
      },
      latLngBounds: (sw, ne) => ({ sw, ne }),
      extend: Object.assign
    }));
  }

  beforeEach(() => {
    jest.resetModules();
    global.localStorage = {
      getItem: () => null,
      setItem: () => {}
    };
  });

  afterEach(() => {
    delete global.localStorage;
    delete global.fetch;
  });

  test('requests entrances and parses them off the search response', async () => {
    mockLeaflet();
    let requestedUrl = null;
    global.fetch = jest.fn((url) => {
      requestedUrl = url;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve([{
          display_name: 'Flughafen Berlin Brandenburg',
          lat: '52.3657974',
          lon: '13.4888906',
          entrances: BER_ENTRANCES
        }])
      });
    });

    const geocoder = require('../src/geocoder');
    const results = await geocoder.coordPreserving('https://nominatim.example/').geocode('BER');

    expect(requestedUrl).toContain('entrances=1');
    expect(results[0].entrances).toEqual([
      { osmId: 9942967218, type: 'main', center: expect.objectContaining({ lat: 52.36361, lng: 13.5100542 }) },
      { osmId: 9959231437, type: 'main', center: expect.objectContaining({ lat: 52.3641971, lng: 13.5096892 }) }
    ]);
  });

  test('lifts entrances off the raw payload leaflet-control-geocoder preserves', async () => {
    jest.doMock('leaflet', () => ({
      Control: {
        Geocoder: {
          nominatim: jest.fn(() => ({
            geocode: () => Promise.resolve([{
              name: 'Flughafen Berlin Brandenburg',
              center: { lat: 52.3657974, lng: 13.4888906 },
              properties: { entrances: BER_ENTRANCES }
            }])
          }))
        }
      },
      CRS: { EPSG3857: { scale: () => 1 } },
      latLng: (lat, lng) => ({ lat: +lat, lng: +lng }),
      latLngBounds: (sw, ne) => ({ sw, ne }),
      extend: Object.assign
    }));

    const geocoder = require('../src/geocoder');
    const results = await geocoder.coordPreserving('https://nominatim.example/').geocode('BER');

    expect(results[0].entrances).toHaveLength(2);
    expect(results[0].entrances[0].type).toBe('main');
  });

  test('a typed coordinate keeps its exact position and is offered no entrances', async () => {
    jest.doMock('leaflet', () => ({
      Control: {
        Geocoder: {
          nominatim: jest.fn(() => ({
            reverse: () => Promise.resolve([{
              name: 'Flughafen Berlin Brandenburg',
              center: { lat: 52.3657974, lng: 13.4888906 },
              properties: { entrances: BER_ENTRANCES }
            }])
          }))
        }
      },
      CRS: { EPSG3857: { scale: () => 1 } },
      latLng: (lat, lng) => {
        const obj = { lat: +lat, lng: +lng, toBounds: () => ({}) };
        obj.wrap = () => obj;
        return obj;
      },
      latLngBounds: (sw, ne) => ({ sw, ne }),
      extend: Object.assign
    }));

    const geocoder = require('../src/geocoder');
    const results = await geocoder.coordPreserving('https://nominatim.example/')
      .geocode('52.3657974,13.4888906');

    expect(results[0].center.lat).toBeCloseTo(52.3657974);
    expect(results[0].entrances).toBeUndefined();
  });
});

// Entrance nodes carry no geometry of their own, so the site they belong to is
// outlined instead. Its polygon is fetched separately, never as part of search.
describe('geocoder.fetchOutline', () => {
  function mockLeaflet() {
    jest.doMock('leaflet', () => ({
      Control: { Geocoder: { nominatim: jest.fn(() => ({})) } },
      CRS: { EPSG3857: { scale: () => 1 } },
      latLng: (lat, lng) => ({ lat: +lat, lng: +lng }),
      latLngBounds: (sw, ne) => ({ sw, ne }),
      extend: Object.assign
    }));
  }

  const POLYGON = { type: 'Polygon', coordinates: [[[13.45, 52.34], [13.53, 52.34], [13.53, 52.39], [13.45, 52.34]]] };

  beforeEach(() => {
    jest.resetModules();
    global.localStorage = { getItem: () => null, setItem: () => {} };
  });

  afterEach(() => {
    delete global.localStorage;
    delete global.fetch;
  });

  function respondWith(body) {
    global.fetch = jest.fn(() => Promise.resolve({
      ok: true, status: 200, json: () => Promise.resolve(body)
    }));
  }

  test('looks the place up by OSM id and returns its polygon', async () => {
    mockLeaflet();
    respondWith([{ geojson: POLYGON }]);
    const geocoder = require('../src/geocoder');

    const outline = await geocoder.coordPreserving('https://nominatim.example/')
      .fetchOutline({ osmType: 'way', osmId: 859790021 });

    expect(outline).toEqual(POLYGON);
    const url = global.fetch.mock.calls[0][0];
    expect(url).toContain('lookup?');
    expect(url).toContain('osm_ids=W859790021');
    expect(url).toContain('polygon_geojson=1');
    // No polygon_threshold: its tolerance is absolute degrees, so a value that
    // usefully thins an airport flattens a building into a few stray corners.
    expect(url).not.toContain('polygon_threshold');
  });

  test('caches by place so reopening the picker costs no request', async () => {
    mockLeaflet();
    respondWith([{ geojson: POLYGON }]);
    const geocoder = require('../src/geocoder');
    const g = geocoder.coordPreserving('https://nominatim.example/');

    await g.fetchOutline({ osmType: 'way', osmId: 1 });
    await g.fetchOutline({ osmType: 'way', osmId: 1 });

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('returns null for a place with no area', async () => {
    mockLeaflet();
    respondWith([{ geojson: { type: 'Point', coordinates: [13.5, 52.3] } }]);
    const geocoder = require('../src/geocoder');

    expect(await geocoder.coordPreserving('https://nominatim.example/')
      .fetchOutline({ osmType: 'node', osmId: 42 })).toBeNull();
  });

  test('returns null without requesting anything when the result has no OSM id', async () => {
    mockLeaflet();
    respondWith([{ geojson: POLYGON }]);
    const geocoder = require('../src/geocoder');

    expect(await geocoder.coordPreserving('https://nominatim.example/')
      .fetchOutline({ name: 'somewhere' })).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('a failed lookup is not fatal — the picker just shows no outline', async () => {
    mockLeaflet();
    global.fetch = jest.fn(() => Promise.reject(new Error('offline')));
    const geocoder = require('../src/geocoder');

    expect(await geocoder.coordPreserving('https://nominatim.example/')
      .fetchOutline({ osmType: 'relation', osmId: 7 })).toBeNull();
  });
});
