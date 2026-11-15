'use strict';

jest.mock('../src/vector_layer', () => ({ createLayer: (style, options) => ({ _url: style, style, options, _options: options }) }));
jest.mock('leaflet', () => ({
  tileLayer: (url, options) => ({ url, options }),
  latLng: (lat, lng) => ({ lat, lng })
}));
jest.mock('../src/vector_backgrounds', () => ({ createBackgrounds: (style, options) => ({ vector: { style, options }, streets: { style, options: Object.assign({}, options, { theme: 'original' }) } }) }));

function load(config) {
  jest.resetModules();
  global.window = { osrmConfig: config };
  try { return require('../src/leaflet_options'); }
  finally { delete global.window; }
}

test('adds a named vector base layer and makes it the default', () => {
  const options = load({ OSRM_VECTOR_STYLE: '/styles/local.json', OSRM_VECTOR_NAME: 'Local vector', OSRM_VECTOR_ATTRIBUTION: 'Local provider' });
  expect(options.layer[0]['Local vector'].style).toBe('/styles/local.json');
  expect(options.defaultState.layer).toBe(options.layer[0]['Local vector']);
  expect(options.defaultState.layer.options.attribution).toBe('Local provider');
});

test('preserves explicit raster defaults and all built-in background choices', () => {
  const options = load({ OSRM_VECTOR_STYLE: 'https://tiles.example/style.json', OSRM_DEFAULT_LAYER: 'osm' });
  expect(options.layer[0].Standard).toBeDefined();
  expect(options.defaultState.layer).toBe(options.layer[0]['OpenStreetMap']);
});

test('does not offer an unconfigured or invalid vector style', () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation();
  for (const style of [undefined, '', 42, 'javascript:alert(1)', 'file:///style.json']) {
    expect(load({ OSRM_VECTOR_STYLE: style }).layer[0].Standard).toBeUndefined();
  }
  expect(warn).toHaveBeenCalledTimes(2);
  warn.mockRestore();
});

test('enables the dark vector theme by default and preserves an original-style option', () => {
  expect(load({ OSRM_VECTOR_STYLE: '/style.json' }).vectorTheme).toBe('dark');
  const original = load({ OSRM_VECTOR_STYLE: '/style.json', OSRM_VECTOR_THEME: 'original' });
  expect(original.vectorTheme).toBe('original');
  expect(original.layer[0].Standard.options.theme).toBe('original');
});

test('accepts standard as the default layer key', () => {
  const options = load({ OSRM_VECTOR_STYLE: '/style.json', OSRM_DEFAULT_LAYER: 'standard' });
  expect(options.defaultState.layer).toBe(options.layer[0].Standard);
  expect(options.layer[0].Vector).toBeUndefined();
});

test('orders backgrounds with Standard first and uses official OSM vector tiles', () => {
  const options = load({ OSRM_VECTOR_STYLE: '/style.json' });
  expect(Object.keys(options.layer[0])).toEqual(['Standard', 'OpenStreetMap', 'OpenStreetMap.de', 'Satellite', 'Outdoors']);
  expect(options.layer[0]['OpenStreetMap'].style).toBe('images/openstreetmap/style.json');
  expect(options.layer[0]['OpenStreetMap'].options.theme).toBe('original');
});
