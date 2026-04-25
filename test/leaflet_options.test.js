'use strict';

// Mock leaflet so this test runs in the node environment without a DOM
jest.mock('leaflet', () => ({
  tileLayer: (url, options) => ({ _url: url, _options: options }),
  latLng: (lat, lng) => ({ lat, lng })
}));

const leafletOptions = require('../src/leaflet_options');

describe('leaflet_options — tileset migration', () => {
  describe('base layer URLs', () => {
    test('streets layer uses CartoDB Voyager (not Mapbox)', () => {
      expect(leafletOptions.baselayer.one._url).toContain('cartocdn.com');
      expect(leafletOptions.baselayer.one._url).toContain('voyager');
    });

    test('outdoors layer uses OpenTopoMap (not Mapbox)', () => {
      expect(leafletOptions.baselayer.two._url).toContain('opentopomap.org');
    });

    test('satellite layer uses ESRI World Imagery (not Mapbox)', () => {
      expect(leafletOptions.baselayer.three._url).toContain('arcgisonline.com');
      expect(leafletOptions.baselayer.three._url).toContain('World_Imagery');
    });

    test('OSM layer uses openstreetmap.org', () => {
      expect(leafletOptions.baselayer.four._url).toContain('tile.openstreetmap.org');
    });

    test('OSM.de layer uses openstreetmap.de', () => {
      expect(leafletOptions.baselayer.five._url).toContain('tile.openstreetmap.de');
    });
  });

  describe('no Mapbox dependencies', () => {
    const allLayerURLs = () => Object.values(leafletOptions.baselayer).map(l => l._url);

    test('no layer URL points to api.mapbox.com', () => {
      allLayerURLs().forEach(url => {
        expect(url).not.toContain('api.mapbox.com');
      });
    });

    test('no layer URL contains a Mapbox access token', () => {
      allLayerURLs().forEach(url => {
        expect(url).not.toMatch(/access_token=/);
      });
    });

    test('module does not export a mapbox token string', () => {
      const src = require('fs').readFileSync(
        require('path').join(__dirname, '../src/leaflet_options.js'), 'utf8'
      );
      expect(src).not.toMatch(/pk\.eyJ1/);
      expect(src).not.toMatch(/mapboxToken/);
      expect(src).not.toMatch(/api\.mapbox\.com/);
    });
  });

  describe('layer display names', () => {
    const layerNames = () => Object.keys(leafletOptions.layer[0]);

    test('no display name references Mapbox', () => {
      layerNames().forEach(name => {
        expect(name.toLowerCase()).not.toContain('mapbox');
      });
    });

    test('streets layer is named Streets', () => {
      expect(layerNames()).toContain('Streets');
    });

    test('outdoors layer is named Outdoors', () => {
      expect(layerNames()).toContain('Outdoors');
    });

    test('satellite layer is named Satellite', () => {
      expect(layerNames()).toContain('Satellite');
    });
  });

  describe('default state', () => {
    test('default layer is the streets (CartoDB) tile layer', () => {
      expect(leafletOptions.defaultState.layer._url).toContain('cartocdn.com');
    });

    test('default zoom is 13', () => {
      expect(leafletOptions.defaultState.zoom).toBe(13);
    });

    test('default language is en', () => {
      expect(leafletOptions.defaultState.language).toBe('en');
    });

    test('default center is Washington DC', () => {
      expect(leafletOptions.defaultState.center.lat).toBeCloseTo(38.8995);
      expect(leafletOptions.defaultState.center.lng).toBeCloseTo(-77.0269);
    });
  });

  describe('overlay layers are unchanged', () => {
    test('Hiking overlay still present', () => {
      expect(leafletOptions.overlay['Hiking']).toBeDefined();
      expect(leafletOptions.overlay['Hiking']._url).toContain('waymarkedtrails.org/hiking');
    });

    test('Bike overlay still present', () => {
      expect(leafletOptions.overlay['Bike']).toBeDefined();
      expect(leafletOptions.overlay['Bike']._url).toContain('waymarkedtrails.org/cycling');
    });

    test('Small Components overlay still present', () => {
      expect(leafletOptions.overlay['Small Components']).toBeDefined();
      expect(leafletOptions.overlay['Small Components']._url).toContain('geofabrik.de');
    });
  });
});

describe('leaflet_options — runtime configuration overrides', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  describe('OSRM_BACKEND override', () => {
    test('uses custom backend when OSRM_BACKEND is set', () => {
      global.window = { osrmConfig: { OSRM_BACKEND: 'http://custom:5001' } };
      const leafletOptions = require('../src/leaflet_options');
      expect(leafletOptions.services[0].path).toBe('http://custom:5001/route/v1');
      delete global.window;
    });

    test('uses public router.project-osrm.org in dev mode (no OSRM_ENVIRONMENT)', () => {
      global.window = { osrmConfig: {} };
      const leafletOptions = require('../src/leaflet_options');
      expect(leafletOptions.services[0].path).toBe('https://router.project-osrm.org/route/v1');
      delete global.window;
    });

    test('uses localhost:5000 in Docker mode (OSRM_ENVIRONMENT=docker)', () => {
      global.window = { osrmConfig: { OSRM_ENVIRONMENT: 'docker' } };
      const leafletOptions = require('../src/leaflet_options');
      expect(leafletOptions.services[0].path).toBe('http://localhost:5000/route/v1');
      delete global.window;
    });
  });

  describe('OSRM_CENTER override with validation', () => {
    test('uses custom center when valid lat,lng is provided', () => {
      global.window = { osrmConfig: { OSRM_CENTER: '40.7128,-74.0060' } };
      const leafletOptions = require('../src/leaflet_options');
      expect(leafletOptions.defaultState.center.lat).toBeCloseTo(40.7128);
      expect(leafletOptions.defaultState.center.lng).toBeCloseTo(-74.0060);
      delete global.window;
    });

    test('falls back to default center for invalid coordinates', () => {
      global.window = { osrmConfig: { OSRM_CENTER: 'invalid' } };
      const leafletOptions = require('../src/leaflet_options');
      expect(leafletOptions.defaultState.center.lat).toBeCloseTo(38.8995);
      expect(leafletOptions.defaultState.center.lng).toBeCloseTo(-77.0269);
      delete global.window;
    });

    test('falls back to default center when only one coordinate provided', () => {
      global.window = { osrmConfig: { OSRM_CENTER: '40.7128' } };
      const leafletOptions = require('../src/leaflet_options');
      expect(leafletOptions.defaultState.center.lat).toBeCloseTo(38.8995);
      expect(leafletOptions.defaultState.center.lng).toBeCloseTo(-77.0269);
      delete global.window;
    });
  });

  describe('OSRM_ZOOM override with validation', () => {
    test('uses custom zoom when numeric value is provided', () => {
      global.window = { osrmConfig: { OSRM_ZOOM: 15 } };
      const leafletOptions = require('../src/leaflet_options');
      expect(leafletOptions.defaultState.zoom).toBe(15);
      delete global.window;
    });

    test('uses custom zoom when numeric string is provided', () => {
      global.window = { osrmConfig: { OSRM_ZOOM: '18' } };
      const leafletOptions = require('../src/leaflet_options');
      expect(leafletOptions.defaultState.zoom).toBe(18);
      delete global.window;
    });

    test('falls back to default zoom for non-numeric value', () => {
      global.window = { osrmConfig: { OSRM_ZOOM: 'invalid' } };
      const leafletOptions = require('../src/leaflet_options');
      expect(leafletOptions.defaultState.zoom).toBe(13);
      delete global.window;
    });
  });

  describe('OSRM_LANGUAGE override', () => {
    test('uses custom language when provided', () => {
      global.window = { osrmConfig: { OSRM_LANGUAGE: 'de' } };
      const leafletOptions = require('../src/leaflet_options');
      expect(leafletOptions.defaultState.language).toBe('de');
      delete global.window;
    });

    test('defaults to en when language not provided', () => {
      global.window = { osrmConfig: {} };
      const leafletOptions = require('../src/leaflet_options');
      expect(leafletOptions.defaultState.language).toBe('en');
      delete global.window;
    });
  });

  describe('OSRM_LABEL and OSRM_DEFAULT_LAYER overrides', () => {
    test('uses custom service label when provided', () => {
      global.window = { osrmConfig: { OSRM_LABEL: 'Custom Service' } };
      const leafletOptions = require('../src/leaflet_options');
      expect(leafletOptions.services[0].label).toBe('Custom Service');
      delete global.window;
    });

    test('uses custom default layer when provided', () => {
      global.window = { osrmConfig: { OSRM_DEFAULT_LAYER: 'satellite' } };
      const leafletOptions = require('../src/leaflet_options');
      expect(leafletOptions.defaultState.layer._url).toContain('arcgisonline.com');
      delete global.window;
    });

    test('falls back to streets layer for unknown layer name', () => {
      global.window = { osrmConfig: { OSRM_DEFAULT_LAYER: 'unknown' } };
      const leafletOptions = require('../src/leaflet_options');
      expect(leafletOptions.defaultState.layer._url).toContain('cartocdn.com');
      delete global.window;
    });
  });
});
