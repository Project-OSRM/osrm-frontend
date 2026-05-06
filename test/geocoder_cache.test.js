'use strict';

// Provide a localStorage shim when tests run in a Node environment (Jest may use "node" env).
if (typeof localStorage === 'undefined' || typeof localStorage.getItem !== 'function') {
  global.localStorage = (function () {
    var store = Object.create(null);
    return {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
      setItem: function (k, v) { store[k] = String(v); },
      removeItem: function (k) { delete store[k]; },
      clear: function () { store = Object.create(null); }
    };
  })();
}


// Tests for the Nominatim caching behaviour added to src/geocoder.js
// - caches successful responses and reuses them
// - sets input bg to orange on 429
// - expires entries older than 24h on load
// - evicts oldest entry when capacity exceeded (LRU)

describe('geocoder cache', function() {
  // helper that provides a minimal leaflet mock used by coordPreserving
  function makeLeafletMock() {
    return {
      Control: { Geocoder: { nominatim: jest.fn(function() { return { geocode: jest.fn(function() { return Promise.resolve([]); }), reverse: jest.fn(function() { return Promise.resolve([]); }) }; }) } },
      CRS: { EPSG3857: { scale: function() { return 1; } } },
      latLng: function(lat, lng) { return { lat: +lat, lng: +lng, toBounds: function() { return {}; } }; },
      extend: Object.assign
    };
  }

  beforeEach(function() {
    jest.resetModules();
    if (typeof localStorage !== 'undefined' && localStorage.clear) localStorage.clear();
    // ensure no global fetch leak between tests
    try { delete global.fetch; } catch (e) {}
  });

  afterEach(function() {
    try { delete global.fetch; } catch (e) {}
    jest.clearAllMocks && jest.clearAllMocks();
  });

  test('caches successful search responses and reuses cache', async function() {
    jest.resetModules();
    jest.doMock('leaflet', function() { 
      var m = makeLeafletMock();
      // Force fetch path by returning an object without a geocode() function
      m.Control.Geocoder.nominatim = jest.fn(function() { return {}; });
      return m;
    });

    var fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async function() {
      return [{ display_name: 'Place A', lat: '10', lon: '20', boundingbox: ['10','11','20','21'] }];
    } });
    global.fetch = fetchMock;

    var geocoder = require('../src/geocoder');
    var g = geocoder.coordPreserving('https://nominatim.example/');

    var ctx = { input: { style: {} } };

    var res1 = await g.geocode('Somewhere', undefined, ctx);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(Array.isArray(res1)).toBe(true);
    expect(res1.length).toBe(1);
    expect(ctx.input.style.backgroundColor).toBe('white');

    // second call should come from cache (no additional fetch)
    var res2 = await g.geocode('Somewhere', undefined, ctx);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res2.length).toBe(1);
    expect(ctx.input.style.backgroundColor).toBe('white');

    // persisted cache should contain the search URL key
    var raw = localStorage.getItem('osrm_nominatim_cache_v1');
    expect(raw).toBeTruthy();
    var entries = JSON.parse(raw);
    var expectedUrl = 'https://nominatim.example/search?format=json&addressdetails=1&limit=5&q=' + encodeURIComponent('Somewhere');
    var found = entries.find(function(e) { return e[0] === expectedUrl; });
    expect(found).toBeDefined();
  });

  test('sets input background to orange on 429', async function() {
    jest.resetModules();
    jest.doMock('leaflet', function() { 
      var m = makeLeafletMock();
      m.Control.Geocoder.nominatim = jest.fn(function() { return {}; });
      return m;
    });

    var fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 429 });
    global.fetch = fetchMock;

    var geocoder = require('../src/geocoder');
    var g = geocoder.coordPreserving('https://nominatim.example/');

    var ctx = { input: { style: {} } };
    var res = await g.geocode('RateLimited', undefined, ctx);
    expect(Array.isArray(res)).toBe(true);
    expect(res.length).toBe(0);
    expect(ctx.input.style.backgroundColor).toBe('orange');
  });

  test('expires old entries on load (TTL)', async function() {
    // create an expired entry in localStorage before the cache is created
    var q = 'OldPlace';
    var url = 'https://nominatim.example/search?format=json&addressdetails=1&limit=5&q=' + encodeURIComponent(q);
    var oldTs = Date.now() - (24 * 60 * 60 * 1000) - 1000; // older than 24h
    var stored = [[url, { value: [{ name: 'Old', center: { lat: 11, lng: 22 } }], ts: oldTs }]];
    localStorage.setItem('osrm_nominatim_cache_v1', JSON.stringify(stored));

    jest.resetModules();
    jest.doMock('leaflet', function() {
      var m = makeLeafletMock();
      m.Control.Geocoder.nominatim = jest.fn(function() { return {}; });
      return m;
    });

    var fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async function() {
      return [{ display_name: 'NewOld', lat: '11', lon: '22', boundingbox: ['11','12','22','23'] }];
    } });
    global.fetch = fetchMock;

    var geocoder = require('../src/geocoder');
    var g = geocoder.coordPreserving('https://nominatim.example/');
    var ctx = { input: { style: {} } };

    var res = await g.geocode(q, undefined, ctx);
    // expired entry should not be used -> fetch called
    expect(fetchMock).toHaveBeenCalled();
    expect(ctx.input.style.backgroundColor).toBe('white');
  });

  test('sliding TTL: accessing an entry refreshes its expiry', async function() {
    // Seed a cache entry that is 23h old (within 24h TTL)
    var q = 'SlidingPlace';
    var service = 'https://nominatim.example/';
    var url = service + 'search?format=json&addressdetails=1&limit=5&q=' + encodeURIComponent(q);
    var almostExpiredTs = Date.now() - (23 * 60 * 60 * 1000); // 23h ago
    var stored = [[url, { value: [{ name: 'Sliding', center: { lat: 1, lng: 2 } }], ts: almostExpiredTs }]];
    localStorage.setItem('osrm_nominatim_cache_v1', JSON.stringify(stored));

    jest.resetModules();
    jest.doMock('leaflet', function() {
      var m = makeLeafletMock();
      m.Control.Geocoder.nominatim = jest.fn(function() { return {}; });
      return m;
    });
    global.fetch = jest.fn();

    var geocoder = require('../src/geocoder');
    var g = geocoder.coordPreserving(service);
    var ctx = { input: { style: {} } };

    // First access: should hit cache (entry is 23h old, within 24h TTL)
    var res1 = await g.geocode(q, undefined, ctx);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(res1.length).toBe(1);

    // The timestamp in localStorage should now be refreshed (close to Date.now())
    var raw = JSON.parse(localStorage.getItem('osrm_nominatim_cache_v1'));
    var entry = raw.find(function(e) { return e[0] === url; });
    expect(entry).toBeDefined();
    var refreshedTs = entry[1].ts;
    // Refreshed timestamp should be much more recent than the original 23h-old one
    expect(Date.now() - refreshedTs).toBeLessThan(5000);
  });

  test('evicts oldest entry when capacity exceeded', async function() {
    // pre-populate localStorage with 128 entries in insertion order
    var service = 'https://nominatim.example/';
    var now = Date.now();
    var entries = [];
    for (var i = 0; i < 128; i++) {
      var u = service + 'search?format=json&addressdetails=1&limit=5&q=' + encodeURIComponent('q' + i);
      entries.push([u, { value: [{ name: 'P' + i, center: { lat: i, lng: i } }], ts: now }]);
    }
    localStorage.setItem('osrm_nominatim_cache_v1', JSON.stringify(entries));

    jest.resetModules();
    jest.doMock('leaflet', function() { return makeLeafletMock(); });

    var fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async function() {
      return [{ display_name: 'New', lat: '1', lon: '2', boundingbox: ['1','1','2','2'] }];
    } });
    global.fetch = fetchMock;

    var geocoder = require('../src/geocoder');
    var g = geocoder.coordPreserving(service);
    var ctx = { input: { style: {} } };

    var res = await g.geocode('NewPlace', undefined, ctx);

    var raw = localStorage.getItem('osrm_nominatim_cache_v1');
    expect(raw).toBeTruthy();
    var arr = JSON.parse(raw);
    // ensure size capped at 128 and oldest (q0) removed while NewPlace present
    expect(arr.length).toBeLessThanOrEqual(128);
    var firstExpected = service + 'search?format=json&addressdetails=1&limit=5&q=' + encodeURIComponent('q0');
    expect(arr.find(function(e) { return e[0] === firstExpected; })).toBeUndefined();
    var newUrl = service + 'search?format=json&addressdetails=1&limit=5&q=' + encodeURIComponent('NewPlace');
    expect(arr.find(function(e) { return e[0] === newUrl; })).toBeDefined();
  });

  test('uses nominatim geocode path and caches results', async function() {
    jest.resetModules();
    var geocodeMock = jest.fn().mockResolvedValue([{ name: 'NPlace', center: { lat: 10, lng: 20 }, bbox: [10,11,20,21] }]);
    jest.doMock('leaflet', function() {
      var m = makeLeafletMock();
      m.Control.Geocoder.nominatim = jest.fn(function() { return { geocode: geocodeMock }; });
      return m;
    });
    try { delete global.fetch; } catch (e) {}

    var geocoder = require('../src/geocoder');
    var g = geocoder.coordPreserving('https://nominatim.example/');
    var ctx = { input: { style: {} } };

    var res1 = await g.geocode('NPlace', undefined, ctx);
    expect(geocodeMock).toHaveBeenCalledTimes(1);
    expect(ctx.input.style.backgroundColor).toBe('white');

    var res2 = await g.geocode('NPlace', undefined, ctx);
    expect(geocodeMock).toHaveBeenCalledTimes(1);
  });

  test('caches nominatim.reverse results and reuses them', async function() {
    jest.resetModules();
    var reverseMock = jest.fn().mockResolvedValue([{ name: 'RPlace', center: { lat: 11, lng: 22 }, bbox: [11,12,22,23] }]);
    var nominatimFactory = jest.fn(function() { return { reverse: reverseMock }; });
    jest.doMock('leaflet', function() {
      return {
        Control: { Geocoder: { nominatim: nominatimFactory } },
        CRS: { EPSG3857: { scale: function() { return 1; } } },
        latLng: function(lat, lng) { return { lat: +lat, lng: +lng, toBounds: function() { return {}; } }; },
        extend: Object.assign
      };
    });
    try { delete global.fetch; } catch (e) {}

    var geocoder = require('../src/geocoder');
    var g = geocoder.coordPreserving('https://nominatim.example/');
    var ctx = { input: { style: {} } };

    var res1 = await g.reverse({ lat: 11, lng: 22 }, 18, undefined, ctx);
    expect(reverseMock).toHaveBeenCalledTimes(1);
    expect(ctx.input.style.backgroundColor).toBe('white');

    var res2 = await g.reverse({ lat: 11, lng: 22 }, 18, undefined, ctx);
    expect(reverseMock).toHaveBeenCalledTimes(1);
  });

  test('LRU order is persisted to localStorage on get()', async function() {
    // Seed 3 entries: q0 (oldest/LRU), q1, q2 (newest/MRU)
    var service = 'https://nominatim.example/';
    var now = Date.now();
    var entries = [];
    for (var i = 0; i < 3; i++) {
      var u = service + 'search?format=json&addressdetails=1&limit=5&q=' + encodeURIComponent('q' + i);
      entries.push([u, { value: [{ name: 'P' + i, center: { lat: i, lng: i } }], ts: now }]);
    }
    localStorage.setItem('osrm_nominatim_cache_v1', JSON.stringify(entries));

    jest.resetModules();
    jest.doMock('leaflet', function() {
      var m = makeLeafletMock();
      m.Control.Geocoder.nominatim = jest.fn(function() { return {}; });
      return m;
    });
    try { delete global.fetch; } catch (e) {}

    var geocoder = require('../src/geocoder');
    var g = geocoder.coordPreserving(service);
    var ctx = { input: { style: {} } };

    // Access q0 — this should move it to the end (MRU position)
    await g.geocode('q0', undefined, ctx);

    // Check that localStorage now has q0 last (MRU)
    var raw = JSON.parse(localStorage.getItem('osrm_nominatim_cache_v1'));
    var keys = raw.map(function(e) { return e[0]; });
    var q0Url = service + 'search?format=json&addressdetails=1&limit=5&q=' + encodeURIComponent('q0');
    expect(keys[keys.length - 1]).toBe(q0Url);
    // q1 should now be the first (LRU) entry
    var q1Url = service + 'search?format=json&addressdetails=1&limit=5&q=' + encodeURIComponent('q1');
    expect(keys[0]).toBe(q1Url);
  });

  test('enforces maxEntries on load', async function() {
    // Seed 140 entries (more than the 128 limit)
    var service = 'https://nominatim.example/';
    var now = Date.now();
    var entries = [];
    for (var i = 0; i < 140; i++) {
      var u = service + 'search?format=json&addressdetails=1&limit=5&q=' + encodeURIComponent('over' + i);
      entries.push([u, { value: [{ name: 'P' + i, center: { lat: i, lng: i } }], ts: now }]);
    }
    localStorage.setItem('osrm_nominatim_cache_v1', JSON.stringify(entries));

    jest.resetModules();
    jest.doMock('leaflet', function() {
      var m = makeLeafletMock();
      m.Control.Geocoder.nominatim = jest.fn(function() { return {}; });
      return m;
    });
    try { delete global.fetch; } catch (e) {}

    var geocoder = require('../src/geocoder');
    geocoder.coordPreserving(service);

    // After load, the first cache operation should have already trimmed.
    // Access any entry to trigger a persist and check the stored count.
    var g = geocoder.coordPreserving(service);
    var ctx = { input: { style: {} } };
    await g.geocode('over139', undefined, ctx);

    var raw = JSON.parse(localStorage.getItem('osrm_nominatim_cache_v1'));
    expect(raw.length).toBeLessThanOrEqual(128);
    // The oldest entries (over0..over11) should have been evicted
    var firstUrl = service + 'search?format=json&addressdetails=1&limit=5&q=' + encodeURIComponent('over0');
    expect(raw.find(function(e) { return e[0] === firstUrl; })).toBeUndefined();
  });

  test('persists bbox in canonical array format', async function() {
    jest.resetModules();
    // Mock Leaflet with latLngBounds that has getSouthWest/getNorthEast
    jest.doMock('leaflet', function() {
      return {
        Control: { Geocoder: { nominatim: jest.fn(function() { return {}; }) } },
        CRS: { EPSG3857: { scale: function() { return 1; } } },
        latLng: function(lat, lng) { return { lat: +lat, lng: +lng, toBounds: function() { return {}; } }; },
        latLngBounds: function(sw, ne) {
          return {
            _southWest: sw, _northEast: ne,
            getSouthWest: function() { return sw; },
            getNorthEast: function() { return ne; }
          };
        },
        extend: Object.assign
      };
    });

    var fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async function() {
      return [{ display_name: 'BboxPlace', lat: '10', lon: '20', boundingbox: ['10','11','20','21'] }];
    } });
    global.fetch = fetchMock;

    var geocoder = require('../src/geocoder');
    var g = geocoder.coordPreserving('https://nominatim.example/');
    var ctx = { input: { style: {} } };

    await g.geocode('BboxPlace', undefined, ctx);

    var raw = JSON.parse(localStorage.getItem('osrm_nominatim_cache_v1'));
    expect(raw.length).toBe(1);
    var cached = raw[0][1].value[0];
    // bbox should be stored as canonical [south, north, west, east] array
    expect(Array.isArray(cached.bbox)).toBe(true);
    expect(cached.bbox).toEqual([10, 11, 20, 21]);
    // center should be stored as plain {lat, lng} object
    expect(cached.center).toEqual({ lat: 10, lng: 20 });
  });

});
