/**
 * @jest-environment jsdom
 */
'use strict';

var createState = require('../src/state');

function createEmitter() {
  return {
    _handlers: {},
    on: function(event, handler) {
      this._handlers[event] = this._handlers[event] || [];
      this._handlers[event].push(handler);
    },
    fire: function(event, payload) {
      (this._handlers[event] || []).forEach(function(handler) {
        handler(payload);
      });
    }
  };
}

describe('State language updates', function() {
  it('updates geocoder placeholders when language changes', function() {
    var plan = createEmitter();
    plan.options = {
      language: 'en',
      geocoderPlaceholder: function(i, n, geocoderElem) {
        if (i === 0) return geocoderElem.options.language + '-start';
        if (i === n - 1) return geocoderElem.options.language + '-end';
        return geocoderElem.options.language + '-via';
      }
    };
    plan._geocoderElems = [
      { options: { language: 'en' }, _element: { input: document.createElement('input') } },
      { options: { language: 'en' }, _element: { input: document.createElement('input') } },
      { options: { language: 'en' }, _element: { input: document.createElement('input') } }
    ];

    var lrmControl = createEmitter();
    lrmControl._routes = [];
    lrmControl.getPlan = function() {
      return plan;
    };
    lrmControl.setWaypoints = function() {};

    var map = createEmitter();
    map.setView = function() {};

    var tools = createEmitter();
    tools.updateLocalization = function() {};

    var modeSelector = {
      updateLocalization: function() {}
    };

    createState(map, lrmControl, tools, modeSelector, {
      waypoints: [],
      center: { lat: 0, lng: 0 },
      zoom: 3,
      language: 'en'
    });

    tools.fire('languagechanged', { language: 'de' });

    expect(plan.options.language).toBe('de');
    expect(plan._geocoderElems[0]._element.input.getAttribute('placeholder')).toBe('de-start');
    expect(plan._geocoderElems[1]._element.input.getAttribute('placeholder')).toBe('de-via');
    expect(plan._geocoderElems[2]._element.input.getAttribute('placeholder')).toBe('de-end');
  });

  it('keeps left-hand traffic classification after a language change', function() {
    // A U-turn in left-hand traffic where the backend disagrees: gauche-rs says
    // 'left', the routing service reports driving_side 'right'. Rebuilding the
    // itinerary for a new language must keep using the classifier, or the row
    // silently falls back to the backend and the arrow turns the wrong way.
    var step = {
      maneuver: { type: 'continue', modifier: 'uturn', location: [100.565688, 13.822959] },
      driving_side: 'right',
      distance: 400,
      duration: 60,
      mode: 'driving',
      name: 'Phahon Yothin',
      intersections: [{ location: [100.565688, 13.822959], entry: [true], bearings: [0] }]
    };

    var classifier = {
      isReady: function() { return true; },
      classifyPoint: function() { return 'left'; }
    };

    var plan = createEmitter();
    plan.options = { language: 'en', geocoderPlaceholder: function() { return ''; } };
    plan._geocoderElems = [];

    var built = [];
    var lrmControl = createEmitter();
    lrmControl._routes = [{ instructions: [], coordinates: [] }];
    lrmControl.getPlan = function() { return plan; };
    lrmControl.setWaypoints = function() {};
    lrmControl.setAlternatives = function() {
      // Render one U-turn row through whatever builder is installed now.
      // _itineraryBuilder holds an instance, and createStep takes the OSRM
      // step itself as its first argument.
      built.push(this._itineraryBuilder.createStep(step, '400 m', 'u-turn',
        document.createElement('tbody')));
    };

    var map = createEmitter();
    map.setView = function() {};
    var tools = createEmitter();
    tools.updateLocalization = function() {};

    createState(map, lrmControl, tools, { updateLocalization: function() {} }, {
      waypoints: [],
      center: { lat: 0, lng: 0 },
      zoom: 3,
      language: 'en'
    }, classifier);

    tools.fire('languagechanged', { language: 'de' });

    expect(built.length).toBe(1);
    expect(built[0].className).toContain('osrm-left-hand-traffic');
  });
});
