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
});
