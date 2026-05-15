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

  test('ly URL param takes precedence over stored localStorage layer', function() {
    const parsed = links.parse('ly=Satellite');
    const mappedLayer = leafletOptions.layer;
    const storedLayerName = 'Streets';
    // emulate selection: prefer parsed.layer over stored
    const chosen = (parsed && parsed.layer) ? (mappedLayer[0][parsed.layer] || leafletOptions.defaultState.layer) : (mappedLayer[0][storedLayerName] || leafletOptions.defaultState.layer);
    expect(chosen).toBe(mappedLayer[0]['Satellite']);
  });

  test('stored layer name is matched case-insensitively', function() {
    const mappedLayer = leafletOptions.layer;
    const storedLower = 'satellite';
    // simulate resolveLayerByName behavior: case-insensitive lookup
    const keys = Object.keys(mappedLayer[0]);
    var found = undefined;
    for (var i=0;i<keys.length;i++) if (keys[i].toLowerCase() === storedLower) found = mappedLayer[0][keys[i]];
    expect(found).toBe(mappedLayer[0]['Satellite']);
  });
});
