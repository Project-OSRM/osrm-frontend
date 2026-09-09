'use strict';

jest.mock('leaflet', () => {
  const latLng = (lat, lng) => ({
    lat: lat,
    lng: lng,
    wrap: function() { return latLng(this.lat, ((this.lng + 180) % 360 + 360) % 360 - 180); },
    toBounds: function() { return { _center: this }; }
  });
  return {
    tileLayer: (url, options) => ({ _url: url, _options: options }),
    latLng: latLng
  };
});

// `geocoders` is a getter reading window.osrmConfig fresh on every access, so
// the config has to stay in place while the returned module is used.
function loadOptions(osrmConfig) {
  jest.resetModules();
  global.window = { osrmConfig: osrmConfig };
  return require('../src/leaflet_options');
}

afterEach(() => {
  delete global.window;
  jest.resetModules();
});

describe('OSRM_GEOCODERS configuration', () => {
  test('an unconfigured deployment offers the bundled Nominatim instance', () => {
    // Behaviour has to be unchanged for anyone who sets nothing, and the
    // build-time NOMINATIM_ENDPOINT substitution still feeds this entry.
    const opts = loadOptions({});
    expect(opts.geocoders).toEqual([
      { name: 'Nominatim', url: 'https://nominatim.openstreetmap.org/' }
    ]);
    expect(opts.geocoders[0].url).toBe(opts.nominatim.path);
  });

  test('a JSON string of entries is parsed in order', () => {
    const opts = loadOptions({
      OSRM_GEOCODERS: JSON.stringify([
        { name: 'House Nominatim', url: 'https://nominatim.internal/' },
        { name: 'Coordinates only', url: '' }
      ])
    });
    expect(opts.geocoders).toEqual([
      { name: 'House Nominatim', url: 'https://nominatim.internal/' },
      { name: 'Coordinates only', url: '' }
    ]);
  });

  test('an already-parsed array is accepted', () => {
    const opts = loadOptions({
      OSRM_GEOCODERS: [{ name: 'House', url: 'https://nominatim.internal/' }]
    });
    expect(opts.geocoders[0].url).toBe('https://nominatim.internal/');
  });

  test('a lone empty-url entry offers coordinates only', () => {
    // The configuration a deployment forbidden from reaching third parties ships.
    const opts = loadOptions({ OSRM_GEOCODERS: '[{"url":""}]' });
    expect(opts.geocoders).toEqual([{ name: 'Coordinates only', url: '' }]);
  });

  test('bare strings are accepted as endpoint URLs', () => {
    const opts = loadOptions({ OSRM_GEOCODERS: '["https://nominatim.internal/",""]' });
    expect(opts.geocoders).toEqual([
      { name: 'Geocoder 1', url: 'https://nominatim.internal/' },
      { name: 'Coordinates only', url: '' }
    ]);
  });

  test('an unnamed endpoint gets a positional name', () => {
    const opts = loadOptions({ OSRM_GEOCODERS: '[{"url":"https://a.example/"},{"url":"https://b.example/"}]' });
    expect(opts.geocoders.map((g) => g.name)).toEqual(['Geocoder 1', 'Geocoder 2']);
  });

  test('surrounding whitespace is trimmed off names and URLs', () => {
    const opts = loadOptions({ OSRM_GEOCODERS: '[{"name":"  House  ","url":"  https://nominatim.internal/  "}]' });
    expect(opts.geocoders).toEqual([{ name: 'House', url: 'https://nominatim.internal/' }]);
  });

  test('malformed JSON warns and falls back to the default geocoder', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const opts = loadOptions({ OSRM_GEOCODERS: '[{not json' });
    expect(opts.geocoders[0].name).toBe('Nominatim');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to parse OSRM_GEOCODERS JSON:'), expect.anything());
    warnSpy.mockRestore();
  });

  test('an empty or blank value falls back to the default geocoder', () => {
    ['', '   ', '[]', undefined, null, 42].forEach((value) => {
      const opts = loadOptions({ OSRM_GEOCODERS: value });
      expect(opts.geocoders[0].name).toBe('Nominatim');
    });
  });

  test('the config is read fresh, not captured at module load', () => {
    const opts = loadOptions({});
    expect(opts.geocoders[0].name).toBe('Nominatim');
    global.window = { osrmConfig: { OSRM_GEOCODERS: '[{"name":"Late","url":"https://late.example/"}]' } };
    expect(opts.geocoders[0].name).toBe('Late');
  });
});

describe('coordinates-only geocoder', () => {
  const createGeocoder = require('../src/geocoder');

  test('has no reverse method, so LRM names waypoints without a request', () => {
    // GeocoderElement.update() checks for `reverse` and falls straight through
    // to waypointNameFallback when it is absent — that omission is the feature.
    expect(createGeocoder.coordinatesOnly().reverse).toBeUndefined();
  });

  test('resolves typed coordinates without contacting anything', async () => {
    const results = await createGeocoder.coordinatesOnly().geocode('34.129382, -118.141254');
    expect(results).toHaveLength(1);
    expect(results[0].center.lat).toBe(34.129382);
    expect(results[0].center.lng).toBe(-118.141254);
  });

  test('returns nothing for a place name', () => {
    return createGeocoder.coordinatesOnly().suggest('Berlin').then((results) => {
      expect(results).toEqual([]);
    });
  });

  test('calls back with the results, as LRM autocomplete expects', () => {
    const cb = jest.fn();
    const context = {};
    return createGeocoder.coordinatesOnly().geocode('1,2', cb, context).then(() => {
      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb.mock.instances[0]).toBe(context);
      expect(cb.mock.calls[0][0][0].center.lat).toBe(1);
    });
  });

  test('outlines resolve to null rather than hitting the lookup endpoint', () => {
    return createGeocoder.coordinatesOnly().fetchOutline({ osmType: 'way', osmId: 1 })
      .then((outline) => expect(outline).toBeNull());
  });

  test('names coordinates in a form the search box accepts back', () => {
    // A pinned location the user cannot paste back is the complaint in #321.
    const name = createGeocoder.plainCoordinateNameFallback({ lat: 34.129382, lng: -118.141254 });
    expect(name).toBe('34.129382, -118.141254');
    return createGeocoder.coordinatesOnly().geocode(name).then((results) => {
      expect(results[0].center.lat).toBeCloseTo(34.129382, 6);
      expect(results[0].center.lng).toBeCloseTo(-118.141254, 6);
    });
  });

  test('the coordinate name wraps longitude into [-180, 180]', () => {
    const latLng = require('leaflet').latLng(10, 190);
    expect(createGeocoder.plainCoordinateNameFallback(latLng)).toBe('10.000000, -170.000000');
  });
});
