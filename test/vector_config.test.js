'use strict';

jest.mock('../src/small_components', () => ({ createLayer: () => ({ _url: 'OSRM component tiles', setService: jest.fn() }) }));

jest.mock('../src/vector_layer', () => ({ createLayer: (style, options) => ({ _url: style, style, options, _options: options }) }));
jest.mock('leaflet', () => ({
  tileLayer: (url, options) => ({ url, options }),
  latLng: (lat, lng) => ({ lat, lng })
}));
jest.mock('../src/vector_backgrounds', () => require('./__vector_backgrounds'));

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

test.each([undefined, 'streets'])('keeps the classic CARTO layer as the Docker default (%s)', layerKey => {
  const options = load({ OSRM_ENVIRONMENT: 'docker', OSRM_DEFAULT_LAYER: layerKey, OSRM_CARTO_KEY: ' sample+key ' });
  const layers = options.layer[0];
  expect(options.defaultState.layer).toBe(layers.Streets);
  expect(layers.Streets.url).toBe('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=sample%2Bkey');
  expect(layers.Streets.options.attribution).toContain('CARTO');
  expect(Object.keys(layers)).toEqual(['Streets', 'Outdoors', 'Satellite', 'openstreetmap.org', 'openstreetmap.de']);
  expect(options.vectorTheme).toBe('original');
  expect(options.overlay['Street overlay']).toBeUndefined();
});

test('preserves the Docker raster OSM key and honors an explicit vector style', () => {
  const raster = load({ OSRM_ENVIRONMENT: 'docker', OSRM_DEFAULT_LAYER: 'osm' });
  expect(raster.defaultState.layer).toBe(raster.layer[0]['openstreetmap.org']);
  expect(raster.defaultState.layer.url).toBe('https://tile.openstreetmap.org/{z}/{x}/{y}.png');

  const vector = load({
    OSRM_ENVIRONMENT: 'docker',
    OSRM_VECTOR_STYLE: 'images/openstreetmap/style.json',
    OSRM_DEFAULT_LAYER: 'vector'
  });
  expect(vector.defaultState.layer).toBe(vector.layer[0]['Dark Vector']);
  expect(vector.defaultState.layer.style).toBe('images/openstreetmap/style.json');
  expect(vector.overlay['Street overlay']).toBeDefined();
});

test('honors the chosen OpenStreetMap default alongside a custom vector style', () => {
  const options = load({ OSRM_VECTOR_STYLE: 'https://tiles.example/style.json', OSRM_DEFAULT_LAYER: 'osm' });
  expect(options.layer[0]['Dark Vector']).toBeDefined();
  expect(options.defaultState.layer).toBe(options.layer[0]['OpenStreetMap']);
});

test('does not offer an unconfigured or invalid vector style', () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation();
  for (const style of [undefined, '', 42, 'javascript:alert(1)', 'file:///style.json']) {
    expect(load({ OSRM_VECTOR_STYLE: style }).layer[0]['Dark Vector']).toBeUndefined();
  }
  expect(warn).toHaveBeenCalledTimes(2);
  warn.mockRestore();
});

test('enables the dark vector theme by default and preserves an original-style option', () => {
  expect(load({ OSRM_VECTOR_STYLE: '/style.json' }).vectorTheme).toBe('dark');
  const original = load({ OSRM_VECTOR_STYLE: '/style.json', OSRM_VECTOR_THEME: 'original' });
  expect(original.vectorTheme).toBe('original');
  expect(original.layer[0]['Dark Vector'].options.theme).toBe('original');
});

test('accepts standard as the default layer key', () => {
  const options = load({ OSRM_VECTOR_STYLE: '/style.json', OSRM_DEFAULT_LAYER: 'standard' });
  expect(options.defaultState.layer).toBe(options.layer[0]['Dark Vector']);
  expect(options.layer[0].Vector).toBeUndefined();
});

test('orders backgrounds with OpenStreetMap first and Dark Vector second and uses official OSM vector tiles', () => {
  const options = load({ OSRM_VECTOR_STYLE: '/style.json' });
  expect(Object.keys(options.layer[0])).toEqual(['OpenStreetMap', 'Dark Vector', 'OpenStreetMap.de', 'Satellite', 'Outdoors']);
  expect(options.layer[0]['OpenStreetMap'].style).toBe('images/openstreetmap/style.json');
  expect(options.layer[0]['OpenStreetMap'].options.theme).toBe('original');
});


test('uses the shared original variant for the built-in Shortbread style', () => {
  const options = load({ OSRM_VECTOR_STYLE: 'images/openstreetmap/style.json' });
  expect(options.layer[0]['Dark Vector'].style).toBe('images/openstreetmap/style.json');
  expect(options.layer[0].OpenStreetMap.style).toBe(options.layer[0]['Dark Vector'].style);
  expect(options.layer[0].OpenStreetMap).not.toBe(options.layer[0]['Dark Vector']);
  expect(options.layer[0].OpenStreetMap.options.theme).toBe('original');
  expect(options.defaultState.layer).toBe(options.layer[0].OpenStreetMap);
});


test('accepts the dark_vector deployment key', () => {
  const options = load({ OSRM_VECTOR_STYLE: 'images/openstreetmap/style.json', OSRM_DEFAULT_LAYER: 'dark_vector' });
  expect(options.defaultState.layer).toBe(options.layer[0]['Dark Vector']);
});
