'use strict';

// Mock leaflet so this test runs in the node environment without a DOM
jest.mock('leaflet', () => ({
  tileLayer: (url, options) => ({ _url: url, _options: options }),
  latLng: (lat, lng) => ({ lat: lat, lng: lng })
}));

const leafletOptions = require('../src/leaflet_options');
const links = require('../src/links');

describe('index baselayer initialization', function() {
  test('Object.assign({}, defaultState, parsed) does not mutate defaultState.layer', function() {
    const parsed = links.parse('ly=Satellite');
    const merged = Object.assign({}, leafletOptions.defaultState, parsed);
    expect(typeof leafletOptions.defaultState.layer).toBe('object');
  });

  test('chooses baselayer from mergedOptions.layer when present', function() {
    const parsed = links.parse('ly=Satellite');
    const merged = Object.assign({}, leafletOptions.defaultState, parsed);
    const mapLayer = leafletOptions.layer;
    const baselayer = (merged.layer && typeof merged.layer === 'string') ? mapLayer[0][merged.layer] : leafletOptions.defaultState.layer;
    expect(baselayer).toBeDefined();
  });
});
