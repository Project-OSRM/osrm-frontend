/**
 * @jest-environment jsdom
 */

'use strict';

jest.mock('leaflet', () => {
  function Evented() {}
  Evented.prototype = {
    on: function(type, handler) {
      this._events = this._events || {};
      this._events[type] = this._events[type] || [];
      this._events[type].push(handler);
      return this;
    },
    fire: function(type, event) {
      var handlers = this._events && this._events[type] || [];
      handlers.forEach(function(handler) {
        handler.call(this, event);
      }, this);
      return this;
    }
  };

  function Control() {}

  Control.extend = function(props) {
    function Extended() {
      this.options = Object.assign({}, props.options);
      if (props.initialize) {
        props.initialize.apply(this, arguments);
      }
    }

    Extended.prototype = Object.assign({}, props.includes || {}, props);
    delete Extended.prototype.includes;
    return Extended;
  };

  return {
    Control: Control,
    Evented: Evented,
    Mixin: { Events: Evented.prototype },
    setOptions: function(target, options) {
      target.options = Object.assign(target.options || {}, options);
    }
  };
});

describe('tools debug map link', () => {
  let tools;
  let control;
  let openSpy;

  beforeEach(() => {
    jest.resetModules();
    tools = require('../src/tools');
    control = tools.control({}, {}, {});
    control._map = {
      getCenter: function() {
        return { lat: 38.8995, lng: -77.0269 };
      },
      getZoom: function() {
        return 13;
      }
    };
    openSpy = jest.spyOn(window, 'open').mockImplementation(function() {});
  });

  afterEach(() => {
    openSpy.mockRestore();
  });

  test('opens the debug map on the current frontend origin', () => {
    window.history.replaceState({}, '', '/?z=13');

    control._openDebug();

    expect(openSpy).toHaveBeenCalledWith(
      'http://localhost/debug/#13/38.899500/-77.026900'
    );
  });

  test('preserves a frontend subpath when opening the debug map', () => {
    window.history.replaceState({}, '', '/osrm-frontend/index.html?z=13');

    control._openDebug();

    expect(openSpy).toHaveBeenCalledWith(
      'http://localhost/osrm-frontend/debug/#13/38.899500/-77.026900'
    );
  });

  test('keeps the Leaflet event API on the control', () => {
    var handler = jest.fn();

    control.on('languagechanged', handler);
    control.fire('languagechanged', { language: 'en' });

    expect(handler).toHaveBeenCalledWith({ language: 'en' });
  });
});
