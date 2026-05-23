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
    test('uses custom backend when OSRM_BACKEND is set and warns about deprecation', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      global.window = { osrmConfig: { OSRM_BACKEND: 'http://custom:5001' } };
      const leafletOptions = require('../src/leaflet_options');
      expect(leafletOptions.services[0].path).toBe('http://custom:5001/route/v1');
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('DEPRECATION WARNING'));
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('OSRM_BACKEND is deprecated'));
      warnSpy.mockRestore();
      delete global.window;
    });

    test('uses public router.project-osrm.org in dev mode (no OSRM_ENVIRONMENT)', () => {
      global.window = { osrmConfig: {} };
      const leafletOptions = require('../src/leaflet_options');
      expect(leafletOptions.services[0].path).toBe('https://router.project-osrm.org/route/v1');
      delete global.window;
    });

    test('uses public profiles in Docker mode by default (OSRM_ENVIRONMENT=docker)', () => {
      global.window = { osrmConfig: { OSRM_ENVIRONMENT: 'docker' } };
      const leafletOptions = require('../src/leaflet_options');
      expect(leafletOptions.services[0].path).toBe('https://router.project-osrm.org/route/v1');
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

  describe('language precedence (URL > browser > en)', () => {
    test('honors OSRM_LANGUAGE runtime override', () => {
      global.window = { osrmConfig: { OSRM_LANGUAGE: 'de' } };
      const leafletOptions = require('../src/leaflet_options');
      expect(leafletOptions.defaultState.language).toBe('de');
      delete global.window;
    });

    test('uses browser language exact match', () => {
      global.window = { navigator: { languages: ['de'], language: 'de' } };
      const leafletOptions = require('../src/leaflet_options');
      expect(leafletOptions.defaultState.language).toBe('de');
      delete global.window;
    });

    test('falls back to navigator.language when navigator.languages absent', () => {
      global.window = { navigator: { language: 'de' } };
      const leafletOptions = require('../src/leaflet_options');
      expect(leafletOptions.defaultState.language).toBe('de');
      delete global.window;
    });

    test('uses primary subtag when regional locale provided (en-US -> en)', () => {
      global.window = { navigator: { languages: ['en-US'], language: 'en-US' } };
      const leafletOptions = require('../src/leaflet_options');
      expect(leafletOptions.defaultState.language).toBe('en');
      delete global.window;
    });

    test('prefers first candidate in navigator.languages array', () => {
      global.window = { navigator: { languages: ['fr-CA', 'de'], language: 'fr-CA' } };
      const leafletOptions = require('../src/leaflet_options');
      expect(leafletOptions.defaultState.language).toBe('fr');
      delete global.window;
    });

    test('matches exact regional variant when available (pt-BR)', () => {
      global.window = { navigator: { languages: ['pt-BR'], language: 'pt-BR' } };
      const leafletOptions = require('../src/leaflet_options');
      expect(leafletOptions.defaultState.language).toBe('pt-BR');
      delete global.window;
    });

    test('case-insensitive regional tag (pt-br)', () => {
      global.window = { navigator: { languages: ['pt-br'], language: 'pt-br' } };
      const leafletOptions = require('../src/leaflet_options');
      expect(leafletOptions.defaultState.language).toBe('pt-BR');
      delete global.window;
    });

    test('falls back to English when no supported browser languages', () => {
      global.window = { navigator: { languages: ['xx','yy'], language: 'xx' } };
      const leafletOptions = require('../src/leaflet_options');
      expect(leafletOptions.defaultState.language).toBe('en');
      delete global.window;
    });

    test('URL param (hl) takes precedence over browser default when merged', () => {
      // Simulate browser default 'en' but URL param asks for 'de'
      global.window = { navigator: { languages: ['en'], language: 'en' } };
      const leafletOptions = require('../src/leaflet_options');
      const links = require('../src/links');
      const parsed = links.parse('hl=de');
      const merged = Object.assign({}, leafletOptions.defaultState, parsed);
      expect(merged.language).toBe('de');
      delete global.window;
    });
  });

  describe('OSRM_LABEL and OSRM_DEFAULT_LAYER overrides', () => {
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

  describe('OSRM_MODES - free-form mode configuration', () => {
    test('uses three public profiles in Docker by default', () => {
      global.window = { osrmConfig: { OSRM_ENVIRONMENT: 'docker' } };
      const leafletOptions = require('../src/leaflet_options');
      expect(leafletOptions.services.length).toBe(3);
      expect(leafletOptions.services[0].label).toBe('driving');
      expect(leafletOptions.services[0].path).toContain('router.project-osrm.org');
      delete global.window;
    });

    test('uses custom modes from OSRM_MODES JSON', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const modesJSON = JSON.stringify([
        { name: 'Fast Route', url: 'http://custom:5000' },
        { name: 'Scenic Route', url: 'http://custom:5001' }
      ]);
      global.window = {
        osrmConfig: {
          OSRM_ENVIRONMENT: 'docker',
          OSRM_MODES: modesJSON
        }
      };
      const leafletOptions = require('../src/leaflet_options');
      expect(leafletOptions.services.length).toBe(2);
      expect(leafletOptions.services[0].label).toBe('Fast Route');
      expect(leafletOptions.services[0].path).toContain('custom:5000');
      expect(leafletOptions.services[1].label).toBe('Scenic Route');
      expect(leafletOptions.services[1].path).toContain('custom:5001');
      expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('DEPRECATION WARNING'));
      warnSpy.mockRestore();
      delete global.window;
    });

    test('each mode has an internal profile for routing', () => {
      const modesJSON = JSON.stringify([
        { name: 'Car', url: 'http://localhost:5000' },
        { name: 'Bike', url: 'http://localhost:5000' }
      ]);
      global.window = {
        osrmConfig: {
          OSRM_MODES: modesJSON
        }
      };
      const leafletOptions = require('../src/leaflet_options');
      expect(leafletOptions.services[0].profile).toBe('driving');
      expect(leafletOptions.services[1].profile).toBe('bike');
      delete global.window;
    });

    test('preserves explicit path from OSRM_MODES (e.g. routed-bike subdirectory)', () => {
      const modesJSON = JSON.stringify([
        { name: 'driving', url: 'https://router.project-osrm.org', path: 'https://router.project-osrm.org/route/v1' },
        { name: 'bike', url: 'https://routing.openstreetmap.de', path: 'https://routing.openstreetmap.de/routed-bike/route/v1' },
        { name: 'foot', url: 'https://routing.openstreetmap.de', path: 'https://routing.openstreetmap.de/routed-foot/route/v1' }
      ]);
      global.window = {
        osrmConfig: {
          OSRM_ENVIRONMENT: 'docker',
          OSRM_MODES: modesJSON
        }
      };
      const leafletOptions = require('../src/leaflet_options');
      expect(leafletOptions.services[0].path).toBe('https://router.project-osrm.org/route/v1');
      expect(leafletOptions.services[1].path).toBe('https://routing.openstreetmap.de/routed-bike/route/v1');
      expect(leafletOptions.services[2].path).toBe('https://routing.openstreetmap.de/routed-foot/route/v1');
      delete global.window;
    });

    test('defaults to three public profiles in dev mode', () => {
      global.window = { osrmConfig: { OSRM_ENVIRONMENT: undefined } };
      const leafletOptions = require('../src/leaflet_options');
      expect(leafletOptions.services.length).toBe(3);
      expect(leafletOptions.services[0].label).toBe('driving');
      expect(leafletOptions.services[0].path).toContain('router.project-osrm.org');
      expect(leafletOptions.services[1].label).toBe('bike');
      expect(leafletOptions.services[1].path).toContain('routing.openstreetmap.de');
      expect(leafletOptions.services[2].label).toBe('foot');
      expect(leafletOptions.services[2].path).toContain('routing.openstreetmap.de');
      delete global.window;
    });

    test('gracefully handles invalid JSON in OSRM_MODES', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      global.window = {
        osrmConfig: {
          OSRM_ENVIRONMENT: 'docker',
          OSRM_MODES: 'invalid json'
        }
      };
      const leafletOptions = require('../src/leaflet_options');
      // Should fall back to three public profiles
      expect(leafletOptions.services.length).toBe(3);
      expect(leafletOptions.services[0].label).toBe('driving');
      expect(warnSpy).toHaveBeenCalledWith('Failed to parse OSRM_MODES JSON:', expect.any(SyntaxError));
      warnSpy.mockRestore();
      delete global.window;
    });

    test('respects OSRM_BACKEND in Docker default mode and warns about deprecation', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      global.window = {
        osrmConfig: {
          OSRM_ENVIRONMENT: 'docker',
          OSRM_BACKEND: 'http://my-backend:5000'
        }
      };
      const leafletOptions = require('../src/leaflet_options');
      expect(leafletOptions.services[0].path).toContain('my-backend:5000');
      expect(leafletOptions.services[0].label).toBe('default');
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('DEPRECATION WARNING'));
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('OSRM_BACKEND is deprecated'));
      warnSpy.mockRestore();
      delete global.window;
    });

    test('accepts single-string URL in a JSON array as a single mode', () => {
      const modesJSON = JSON.stringify(['http://custom:5000']);
      global.window = {
        osrmConfig: {
          OSRM_ENVIRONMENT: 'docker',
          OSRM_MODES: modesJSON
        }
      };
      const leafletOptions = require('../src/leaflet_options');
      expect(leafletOptions.services.length).toBe(1);
      expect(leafletOptions.services[0].path).toContain('custom:5000');
      expect(leafletOptions.services[0].label).toBe('default');
      delete global.window;
    });

    test('accepts array of string URLs as multiple modes', () => {
      const modesJSON = JSON.stringify(['http://custom:5000','http://custom:5001']);
      global.window = {
        osrmConfig: {
          OSRM_ENVIRONMENT: 'docker',
          OSRM_MODES: modesJSON
        }
      };
      const leafletOptions = require('../src/leaflet_options');
      expect(leafletOptions.services.length).toBe(2);
      expect(leafletOptions.services[0].path).toContain('custom:5000');
      expect(leafletOptions.services[1].path).toContain('custom:5001');
      expect(leafletOptions.services[0].label).toBe('Mode 1');
      expect(leafletOptions.services[1].label).toBe('Mode 2');
      delete global.window;
    });

    test('OSRM_MODES takes priority over OSRM_BACKEND', () => {
      const modesJSON = JSON.stringify([
        { name: 'Custom', url: 'http://custom:5000' }
      ]);
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      global.window = {
        osrmConfig: {
          OSRM_ENVIRONMENT: 'docker',
          OSRM_BACKEND: 'http://ignored:5000',
          OSRM_MODES: modesJSON
        }
      };
      const leafletOptions = require('../src/leaflet_options');
      expect(leafletOptions.services[0].label).toBe('Custom');
      expect(leafletOptions.services[0].path).toContain('custom:5000');
      // Should warn about both env vars being set
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('DEPRECATION WARNING'));
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Both OSRM_MODES and OSRM_BACKEND'));
      warnSpy.mockRestore();
      delete global.window;
    });

    test('legacy OSRM_BACKEND alone shows deprecation warning', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      global.window = {
        osrmConfig: {
          OSRM_ENVIRONMENT: 'docker',
          OSRM_BACKEND: 'http://legacy:5000'
        }
      };
      const leafletOptions = require('../src/leaflet_options');
      expect(leafletOptions.services[0].label).toBe('default');
      expect(leafletOptions.services[0].path).toContain('legacy:5000');
      // Should warn about deprecation
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('DEPRECATION WARNING'));
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('OSRM_BACKEND is deprecated'));
      warnSpy.mockRestore();
      delete global.window;
    });
  });
});
