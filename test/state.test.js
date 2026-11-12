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

describe('State — per-waypoint approaches', function() {
  function buildState(waypoints) {
    var plan = createEmitter();
    var applied = [];
    var lrmControl = createEmitter();
    lrmControl._routes = [];
    lrmControl.getPlan = function() {
      return plan;
    };
    lrmControl.setWaypoints = function(list) {
      applied = list;
    };
    lrmControl.getWaypoints = function() {
      return applied;
    };
    var map = createEmitter();
    map.setView = function() {};
    var tools = createEmitter();
    var state = createState(map, lrmControl, tools, { updateLocalization: function() {} }, {
      waypoints: waypoints,
      zoom: 3,
      language: 'en'
    });
    return { state: state, plan: plan, lrmControl: lrmControl, applied: function() {
      return applied;
    } };
  }

  beforeEach(function() {
    window.history.replaceState({}, '', '/');
  });

  it('gives the plan waypoints that carry the approach from the plain waypoints', function() {
    var built = buildState([
      { lat: 1, lng: 2, approach: 'curb' },
      { lat: 3, lng: 4 },
      { lat: 5, lng: 6, approach: 'opposite' }
    ]);
    var approaches = built.applied().map(function(wp) {
      return wp.options && wp.options.approach;
    });
    expect(approaches).toEqual(['curb', undefined, 'opposite']);
  });

  it('gives waypoints without options when nothing is restricted', function() {
    var built = buildState([{ lat: 1, lng: 2 }, { lat: 3, lng: 4 }]);
    built.applied().forEach(function(wp) {
      expect(wp.options).toBeUndefined();
    });
  });

  it('writes ap to the address bar when the waypoints change', function() {
    var built = buildState([{ lat: 1, lng: 2 }, { lat: 3, lng: 4 }]);
    built.applied()[1].options = { approach: 'curb' };
    built.plan.fire('waypointschanged');
    var search = decodeURIComponent(window.location.search);
    expect(search).toContain('ap=;curb');
  });

  it('drops ap from the address bar once every waypoint is unrestricted again', function() {
    var built = buildState([{ lat: 1, lng: 2, approach: 'curb' }, { lat: 3, lng: 4 }]);
    built.plan.fire('waypointschanged');
    expect(window.location.search).toContain('ap=');
    delete built.applied()[0].options;
    built.plan.fire('waypointschanged');
    expect(window.location.search).not.toContain('ap=');
  });
});
