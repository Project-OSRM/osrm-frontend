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
