'use strict';

// Mock leaflet so this test runs in the node environment without a DOM
jest.mock('leaflet', () => ({
  tileLayer: (url, options) => ({ _url: url, _options: options }),
  latLng: (lat, lng) => ({ lat, lng })
}));

// Load leaflet_options against a given runtime config, isolated from other tests.
function loadWithConfig(osrmConfig) {
  jest.resetModules();
  global.window = { osrmConfig: osrmConfig };
  try {
    return require('../src/leaflet_options');
  } finally {
    delete global.window;
  }
}

afterEach(() => {
  jest.resetModules();
});

describe('OSRM_TILE_URL custom base layer', () => {
  test('adds a base layer pointing at the configured tile server', () => {
    // The whole point of the key: an offline deployment names its own tile
    // server without patching leaflet_options.js and rebuilding the bundle.
    const opts = loadWithConfig({ OSRM_TILE_URL: 'http://localhost:8080/tile/{z}/{x}/{y}.png' });
    expect(opts.layer[0]['Custom']._url).toBe('http://localhost:8080/tile/{z}/{x}/{y}.png');
  });

  test('leaves the layer control untouched when unconfigured', () => {
    const opts = loadWithConfig({});
    expect(Object.keys(opts.layer[0])).toEqual([
      'Streets', 'Outdoors', 'Satellite', 'openstreetmap.org', 'openstreetmap.de'
    ]);
  });

  test('OSRM_TILE_NAME labels the layer in the control', () => {
    const opts = loadWithConfig({
      OSRM_TILE_URL: 'https://tiles.example.com/{z}/{x}/{y}.png',
      OSRM_TILE_NAME: 'Local tiles'
    });
    expect(opts.layer[0]['Local tiles']._url).toContain('tiles.example.com');
    expect(opts.layer[0]['Custom']).toBeUndefined();
  });

  test('a name reusing a built-in label replaces that layer rather than being dropped', () => {
    const opts = loadWithConfig({
      OSRM_TILE_URL: 'https://tiles.example.com/{z}/{x}/{y}.png',
      OSRM_TILE_NAME: 'Streets'
    });
    expect(opts.layer[0]['Streets']._url).toContain('tiles.example.com');
  });

  test('OSRM_TILE_ATTRIBUTION overrides the default OSM credit', () => {
    const opts = loadWithConfig({
      OSRM_TILE_URL: 'https://tiles.example.com/{z}/{x}/{y}.png',
      OSRM_TILE_ATTRIBUTION: '© My Tile Provider'
    });
    expect(opts.layer[0]['Custom']._options.attribution).toBe('© My Tile Provider');
  });

  test('the layer is credited to OpenStreetMap when no attribution is given', () => {
    // Tiles from a private server are usually OSM-derived, so the credit is a
    // safer default than an unattributed layer.
    const opts = loadWithConfig({ OSRM_TILE_URL: 'https://tiles.example.com/{z}/{x}/{y}.png' });
    expect(opts.layer[0]['Custom']._options.attribution).toContain('OpenStreetMap');
  });

  test('a blank or non-string URL adds no layer', () => {
    [undefined, '', '   ', 42, null].forEach((value) => {
      const opts = loadWithConfig({ OSRM_TILE_URL: value });
      expect(opts.layer[0]['Custom']).toBeUndefined();
    });
  });

  test('surrounding whitespace is trimmed off the URL and name', () => {
    const opts = loadWithConfig({
      OSRM_TILE_URL: '  https://tiles.example.com/{z}/{x}/{y}.png  ',
      OSRM_TILE_NAME: '  Local tiles  '
    });
    expect(opts.layer[0]['Local tiles']._url).toBe('https://tiles.example.com/{z}/{x}/{y}.png');
  });

  test('a URL missing a {z}/{x}/{y} placeholder is rejected with a warning', () => {
    // Such a layer would request one constant tile forever; failing loudly at
    // startup beats a map that renders nothing.
    ['https://tiles.example.com/{z}/{x}.png',
      'https://tiles.example.com/tiles.png',
      'https://tiles.example.com/{x}/{y}.png'].forEach((url) => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const opts = loadWithConfig({ OSRM_TILE_URL: url });
      expect(opts.layer[0]['Custom']).toBeUndefined();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('{z}, {x}, {y}'));
      warnSpy.mockRestore();
    });
  });

  test('a URL with an unsupported scheme is rejected with a warning', () => {
    ['javascript:alert(1)//{z}{x}{y}',
      'data:image/png;base64,{z}{x}{y}',
      'ftp://tiles.example.com/{z}/{x}/{y}.png',
      'tiles.example.com/{z}/{x}/{y}.png'].forEach((url) => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const opts = loadWithConfig({ OSRM_TILE_URL: url });
      expect(opts.layer[0]['Custom']).toBeUndefined();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('OSRM_TILE_URL'));
      warnSpy.mockRestore();
    });
  });

  test('protocol-relative and root-relative templates are accepted', () => {
    ['//tiles.example.com/{z}/{x}/{y}.png', '/tiles/{z}/{x}/{y}.png'].forEach((url) => {
      const opts = loadWithConfig({ OSRM_TILE_URL: url });
      expect(opts.layer[0]['Custom']._url).toBe(url);
    });
  });
});

describe('OSRM_TILE_URL and the default layer', () => {
  test('the custom layer becomes the default when no layer is named', () => {
    // A deployment serving its own tiles usually cannot reach CARTO either.
    const opts = loadWithConfig({ OSRM_TILE_URL: 'http://localhost:8080/tile/{z}/{x}/{y}.png' });
    expect(opts.defaultState.layer._url).toContain('localhost:8080');
  });

  test('OSRM_DEFAULT_LAYER=custom selects the configured tile server', () => {
    const opts = loadWithConfig({
      OSRM_TILE_URL: 'http://localhost:8080/tile/{z}/{x}/{y}.png',
      OSRM_DEFAULT_LAYER: 'custom'
    });
    expect(opts.defaultState.layer._url).toContain('localhost:8080');
  });

  test('an explicit OSRM_DEFAULT_LAYER still wins over the custom layer', () => {
    const opts = loadWithConfig({
      OSRM_TILE_URL: 'http://localhost:8080/tile/{z}/{x}/{y}.png',
      OSRM_DEFAULT_LAYER: 'satellite'
    });
    expect(opts.defaultState.layer._url).toContain('arcgisonline.com');
  });

  test('OSRM_DEFAULT_LAYER=custom without a tile URL falls back to streets', () => {
    const opts = loadWithConfig({ OSRM_DEFAULT_LAYER: 'custom' });
    expect(opts.defaultState.layer._url).toContain('cartocdn.com');
  });

  test('a rejected tile URL leaves streets as the default', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const opts = loadWithConfig({ OSRM_TILE_URL: 'ftp://tiles.example.com/{z}/{x}/{y}.png' });
    expect(opts.defaultState.layer._url).toContain('cartocdn.com');
    warnSpy.mockRestore();
  });
});

describe('OSRM_TILE_URL layer selection via URL and stored preference', () => {
  const links = require('../src/links');

  // Mirrors resolveLayerByName() in src/index.js: exact match first, then
  // case-insensitive, over the labels in the layer control.
  function resolveLayerByName(baseLayers, name) {
    if (baseLayers[name]) return baseLayers[name];
    const lower = String(name).toLowerCase();
    const key = Object.keys(baseLayers).find((k) => k.toLowerCase() === lower);
    return key ? baseLayers[key] : undefined;
  }

  // Mirrors canonicalizeLayer() in src/index.js for the object form: the label
  // a layer is written back to the URL under.
  function canonicalizeLayer(baseLayers, layer) {
    return Object.keys(baseLayers).find((k) => baseLayers[k] === layer);
  }

  function loadWithCustomLayer() {
    return loadWithConfig({
      OSRM_TILE_URL: 'http://localhost:8080/tile/{z}/{x}/{y}.png',
      OSRM_TILE_NAME: 'Local tiles'
    });
  }

  test('a ly URL parameter selects the custom layer', () => {
    const opts = loadWithCustomLayer();
    const parsed = links.parse('ly=' + encodeURIComponent('Local tiles'));
    expect(resolveLayerByName(opts.layer[0], parsed.layer)._url).toContain('localhost:8080');
  });

  test('the custom label is matched case-insensitively', () => {
    // Stored preferences and hand-edited links do not preserve casing.
    const opts = loadWithCustomLayer();
    expect(resolveLayerByName(opts.layer[0], 'local tiles')._url).toContain('localhost:8080');
  });

  test('the custom layer canonicalizes back to its label for the URL', () => {
    // Without this the layer choice would be dropped from state.update().
    const opts = loadWithCustomLayer();
    expect(canonicalizeLayer(opts.layer[0], opts.defaultState.layer)).toBe('Local tiles');
  });

  test('a ly value naming no layer leaves the custom layer as the fallback', () => {
    const opts = loadWithCustomLayer();
    const parsed = links.parse('ly=NoSuchLayer');
    const chosen = resolveLayerByName(opts.layer[0], parsed.layer) || opts.defaultState.layer;
    expect(chosen._url).toContain('localhost:8080');
  });

  test('the built-in layers stay selectable alongside the custom one', () => {
    const opts = loadWithCustomLayer();
    expect(resolveLayerByName(opts.layer[0], 'Satellite')._url).toContain('arcgisonline.com');
    expect(Object.keys(opts.layer[0])).toEqual([
      'Streets', 'Outdoors', 'Satellite', 'openstreetmap.org', 'openstreetmap.de', 'Local tiles'
    ]);
  });

  test('overlays are untouched by a custom base layer', () => {
    const opts = loadWithCustomLayer();
    expect(Object.keys(opts.overlay)).toEqual(['Hiking', 'Bike', 'Small Components']);
  });
});
