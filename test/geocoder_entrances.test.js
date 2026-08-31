'use strict';

/**
 * The entrance data's journey through the geocoder: off the wire, through both
 * request paths, into the persisted cache and back out again with usable
 * Leaflet coordinates. A break anywhere along here leaves the picker with
 * nothing to offer, and does so silently.
 */

// A real store, so a value written by one module instance can be read back by
// the next — which is what the persistence tests turn on.
function installLocalStorage() {
  var store = Object.create(null);
  global.localStorage = {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { store = Object.create(null); }
  };
  return () => store;
}

function leafletMock(nominatimImpl) {
  return {
    Control: { Geocoder: { nominatim: jest.fn(() => nominatimImpl || {}) } },
    CRS: { EPSG3857: { scale: () => 1 } },
    latLng: (lat, lng) => {
      const o = { lat: +lat, lng: +lng, _leaflet: true, toBounds: () => ({}) };
      o.wrap = () => o;
      return o;
    },
    latLngBounds: (sw, ne) => ({ sw, ne, _leaflet: true }),
    extend: Object.assign
  };
}

const BER_ENTRANCES = [
  { osm_id: 9942967218, type: 'main', lat: '52.3636100', lon: '13.5100542' },
  { osm_id: 9959231437, type: 'exit', lat: '52.3641971', lon: '13.5096892' }
];

let readStore;

beforeEach(() => {
  jest.resetModules();
  readStore = installLocalStorage();
});

afterEach(() => {
  delete global.localStorage;
  delete global.fetch;
});

describe('search results', () => {
  test('entrances and OSM identity survive the fetch path', async () => {
    jest.doMock('leaflet', () => leafletMock({}));
    global.fetch = jest.fn(() => Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve([{
        display_name: 'Flughafen BER',
        osm_type: 'way',
        osm_id: 859790021,
        lat: '52.3657974',
        lon: '13.4888906',
        entrances: BER_ENTRANCES
      }])
    }));

    const results = await require('../src/geocoder')
      .coordPreserving('https://nominatim.example/').geocode('BER');

    expect(results[0].osmType).toBe('way');
    expect(results[0].osmId).toBe(859790021);
    expect(results[0].entrances).toHaveLength(2);
    expect(results[0].entrances[1]).toEqual({
      osmId: 9959231437,
      type: 'exit',
      center: expect.objectContaining({ lat: 52.3641971, lng: 13.5096892 })
    });
  });

  test('an entrance missing coordinates is dropped, not carried as NaN', async () => {
    jest.doMock('leaflet', () => leafletMock({}));
    global.fetch = jest.fn(() => Promise.resolve({
      ok: true, status: 200,
      json: () => Promise.resolve([{
        display_name: 'X', lat: '1', lon: '2',
        entrances: [
          { osm_id: 1, type: 'main', lat: 'nonsense', lon: '13.5' },
          { osm_id: 2, type: 'main', lat: '52.4', lon: '13.5' }
        ]
      }])
    }));

    const results = await require('../src/geocoder')
      .coordPreserving('https://nominatim.example/').geocode('X');
    expect(results[0].entrances.map((e) => e.osmId)).toEqual([2]);
  });

  test('a place with an empty entrance list carries none at all', async () => {
    jest.doMock('leaflet', () => leafletMock({}));
    global.fetch = jest.fn(() => Promise.resolve({
      ok: true, status: 200,
      json: () => Promise.resolve([{ display_name: 'X', lat: '1', lon: '2', entrances: [] }])
    }));

    const results = await require('../src/geocoder')
      .coordPreserving('https://nominatim.example/').geocode('X');
    // null rather than [], so the picker's "has entrances" check stays simple.
    expect(results[0].entrances).toBeUndefined();
  });

  test('a type Nominatim did not label defaults to the generic value', async () => {
    jest.doMock('leaflet', () => leafletMock({}));
    global.fetch = jest.fn(() => Promise.resolve({
      ok: true, status: 200,
      json: () => Promise.resolve([{
        display_name: 'X', lat: '1', lon: '2',
        entrances: [{ osm_id: 1, lat: '52.4', lon: '13.5' }]
      }])
    }));

    const results = await require('../src/geocoder')
      .coordPreserving('https://nominatim.example/').geocode('X');
    expect(results[0].entrances[0].type).toBe('yes');
  });
});

describe('reverse geocoding', () => {
  test('carries entrances when the fetch path is used', async () => {
    jest.doMock('leaflet', () => leafletMock({}));
    let url = null;
    global.fetch = jest.fn((u) => {
      url = u;
      return Promise.resolve({
        ok: true, status: 200,
        json: () => Promise.resolve({
          display_name: 'Flughafen BER',
          osm_type: 'way', osm_id: 859790021,
          lat: '52.3657974', lon: '13.4888906',
          entrances: BER_ENTRANCES
        })
      });
    });

    const g = require('../src/geocoder').coordPreserving('https://nominatim.example/');
    const results = await g.reverse({ lat: 52.3657974, lng: 13.4888906 }, 1);

    expect(url).toContain('reverse?');
    expect(url).toContain('entrances=1');
    expect(results[0].entrances).toHaveLength(2);
    expect(results[0].osmType).toBe('way');
  });

  test('lifts entrances off the payload leaflet-control-geocoder preserves', async () => {
    jest.doMock('leaflet', () => leafletMock({
      reverse: () => Promise.resolve([{
        name: 'Flughafen BER',
        center: { lat: 52.3657974, lng: 13.4888906 },
        properties: { osm_type: 'way', osm_id: 859790021, entrances: BER_ENTRANCES }
      }])
    }));

    const g = require('../src/geocoder').coordPreserving('https://nominatim.example/');
    const results = await g.reverse({ lat: 52.3657974, lng: 13.4888906 }, 1);

    expect(results[0].entrances).toHaveLength(2);
    expect(results[0].osmId).toBe(859790021);
  });

  test('a marker dropped by hand gets whatever entrances its place has', async () => {
    // This is the drag/click path: reverse geocoding is how a hand-placed
    // waypoint learns what it landed on, so the picker must work there too.
    jest.doMock('leaflet', () => leafletMock({
      reverse: () => Promise.resolve([{
        name: 'Pergamonmuseum',
        center: { lat: 52.5209336, lng: 13.3956302 },
        properties: { osm_type: 'way', osm_id: 313659704, entrances: [BER_ENTRANCES[0]] }
      }])
    }));

    const g = require('../src/geocoder').coordPreserving('https://nominatim.example/');
    const results = await g.reverse({ lat: 52.52, lng: 13.39 }, 1, undefined, undefined);
    expect(results[0].entrances[0].type).toBe('main');
  });
});

describe('persistence across a reload', () => {
  const RESPONSE = [{
    display_name: 'Flughafen BER',
    osm_type: 'way',
    osm_id: 859790021,
    lat: '52.3657974',
    lon: '13.4888906',
    boundingbox: ['52.3408173', '52.3907136', '13.4549773', '13.5388427'],
    entrances: BER_ENTRANCES
  }];

  test('entrances are written to storage in a portable shape', async () => {
    jest.doMock('leaflet', () => leafletMock({}));
    global.fetch = jest.fn(() => Promise.resolve({
      ok: true, status: 200, json: () => Promise.resolve(RESPONSE)
    }));

    await require('../src/geocoder').coordPreserving('https://nominatim.example/').geocode('BER');

    const raw = readStore()['osrm_nominatim_cache_v2'];
    expect(raw).toBeTruthy();
    const cached = JSON.parse(raw)[0][1].value[0];
    expect(cached.osmType).toBe('way');
    expect(cached.osmId).toBe(859790021);
    // Plain lat/lng objects, not whatever Leaflet happens to construct.
    expect(cached.entrances).toEqual([
      { osmId: 9942967218, type: 'main', center: { lat: 52.36361, lng: 13.5100542 } },
      { osmId: 9959231437, type: 'exit', center: { lat: 52.3641971, lng: 13.5096892 } }
    ]);
  });

  test('a cached result comes back with Leaflet coordinates and needs no request', async () => {
    jest.doMock('leaflet', () => leafletMock({}));
    global.fetch = jest.fn(() => Promise.resolve({
      ok: true, status: 200, json: () => Promise.resolve(RESPONSE)
    }));
    await require('../src/geocoder').coordPreserving('https://nominatim.example/').geocode('BER');

    // A fresh module instance, reading the store the first one wrote. Its fetch
    // throws, which asserts "served from cache" far more plainly than a call
    // count would — jest.resetModules() clears mock call records anyway.
    jest.resetModules();
    jest.doMock('leaflet', () => leafletMock({}));
    global.fetch = () => { throw new Error('the cache should have answered this'); };

    const results = await require('../src/geocoder')
      .coordPreserving('https://nominatim.example/').geocode('BER');

    expect(results[0].entrances).toHaveLength(2);
    expect(results[0].entrances.map((e) => e.type)).toEqual(['main', 'exit']);
    // Rehydrated through L.latLng, so the picker can measure and place them.
    expect(results[0].entrances[0].center._leaflet).toBe(true);
    expect(results[0].entrances[0].center.lat).toBeCloseTo(52.36361);
    expect(results[0].osmId).toBe(859790021);
  });

  test('a v1 entry without entrances is simply ignored by the v2 key', async () => {
    // The cache key was bumped precisely because older entries predate these
    // fields; a stale one must not be served as a place with no entrances.
    global.localStorage.setItem('osrm_nominatim_cache_v1', JSON.stringify([
      ['https://nominatim.example/search?x', { ts: Date.now(), value: [{ name: 'stale' }] }]
    ]));
    jest.doMock('leaflet', () => leafletMock({}));
    global.fetch = jest.fn(() => Promise.resolve({
      ok: true, status: 200, json: () => Promise.resolve(RESPONSE)
    }));

    const results = await require('../src/geocoder')
      .coordPreserving('https://nominatim.example/').geocode('BER');
    expect(results[0].entrances).toHaveLength(2);
  });
});

// Nominatim returns each entrance node's own tag set as `extratags`, without
// being asked for it. Those tags carry the OSM access keys the mode filter
// needs, so they have to survive the whole way to the picker.
describe('entrance tags', () => {
  const TAGGED = [
    { osm_id: 1, type: 'main', lat: '52.4', lon: '13.5',
      extratags: { access: 'permissive', wheelchair: 'yes' } },
    { osm_id: 2, type: 'yes', lat: '52.41', lon: '13.51',
      extratags: { motor_vehicle: 'no', foot: 'yes' } },
    { osm_id: 3, type: 'yes', lat: '52.42', lon: '13.52' }
  ];

  function respond(entrances) {
    global.fetch = jest.fn(() => Promise.resolve({
      ok: true, status: 200,
      json: () => Promise.resolve([{
        display_name: 'X', osm_type: 'way', osm_id: 1,
        lat: '52.4', lon: '13.5', entrances
      }])
    }));
  }

  test('are carried through as the entrance tags', async () => {
    jest.doMock('leaflet', () => leafletMock({}));
    respond(TAGGED);
    const results = await require('../src/geocoder')
      .coordPreserving('https://nominatim.example/').geocode('X');

    expect(results[0].entrances[0].tags).toEqual({ access: 'permissive', wheelchair: 'yes' });
    expect(results[0].entrances[1].tags).toEqual({ motor_vehicle: 'no', foot: 'yes' });
    // An untagged door carries no tags at all rather than an empty object.
    expect(results[0].entrances[2].tags).toBeUndefined();
  });

  test('survive the cache, or a reloaded place would lose its access rules', async () => {
    jest.doMock('leaflet', () => leafletMock({}));
    respond(TAGGED);
    await require('../src/geocoder').coordPreserving('https://nominatim.example/').geocode('X');

    jest.resetModules();
    jest.doMock('leaflet', () => leafletMock({}));
    global.fetch = () => { throw new Error('the cache should have answered this'); };
    const results = await require('../src/geocoder')
      .coordPreserving('https://nominatim.example/').geocode('X');

    expect(results[0].entrances[1].tags).toEqual({ motor_vehicle: 'no', foot: 'yes' });
    expect(results[0].entrances[2].tags).toBeUndefined();
  });
});
