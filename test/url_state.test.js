/** @jest-environment jsdom */

'use strict';

// Mock leaflet and jsonp like other tests to avoid loading the real browser-dependent library
jest.mock('leaflet', () => ({
  latLng: function(lat, lng) {
    var obj = { lat: lat, lng: lng };
    obj.wrap = function() {
      var v = obj.lng;
      var wrapped = ((v + 180) % 360 + 360) % 360 - 180;
      return { lat: obj.lat, lng: wrapped };
    };
    return obj;
  },
  Routing: {
    waypoint: function(latlng, name) { return { latLng: latlng, name: name || '' }; }
  }
}));

jest.mock('jsonp', () => {});

const urlState = require('../src/url_state');
const qs = require('qs');

describe('url_state.parse/format and history helpers', () => {
  beforeEach(() => {
    // Reset location between tests
    window.history.replaceState({}, '', '/');
    window.location.hash = '';
  });

  test('parse() uses current location only for nullish input, not empty string', () => {
    window.history.replaceState({}, '', '/?z=12');
    const parsedDefault = urlState.parse();
    expect(parsedDefault.zoom).toBe(12);

    // explicit empty string should not default to current location
    const parsedEmpty = urlState.parse('');
    expect(parsedEmpty).toEqual({});
  });

  test('format accepts plain {lat,lng} waypoints and center', () => {
    const out = urlState.format({
      zoom: 9,
      center: { lat: 51.5, lng: -2.8 },
      waypoints: [{ lat: 52.5, lng: 13.4 }],
      language: 'en'
    });
    const parsed = qs.parse(out);
    expect(parsed.center).toBe('51.500000,-2.800000');
    expect(parsed.loc).toBeDefined();
  });

  test('replace() composes URL from origin+pathname (no fragment preservation)', () => {
    // set an initial URL with a fragment
    window.history.replaceState({}, '', '/path#old');
    urlState.replace({ zoom: 10 });
    expect(window.location.pathname).toBe('/path');
    expect(window.location.hash).toBe('');
    expect(window.location.search).toBe('?z=10');
  });

  test('listen() registers and returns an unregister function', () => {
    const cb = jest.fn();
    const unlisten = urlState.listen(cb);
    // Simulate popstate
    window.dispatchEvent(new PopStateEvent('popstate', {}));
    expect(cb).toHaveBeenCalled();
    // cleanup
    if (typeof unlisten === 'function') unlisten();
    cb.mockClear();
    window.dispatchEvent(new PopStateEvent('popstate', {}));
    expect(cb).not.toHaveBeenCalled();
  });
});
