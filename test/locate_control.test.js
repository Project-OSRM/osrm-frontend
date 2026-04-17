/**
 * @jest-environment jsdom
 *
 * Tests for the leaflet.locatecontrol@0.89 Browserify CJS compatibility fix.
 *
 * The library's UMD wrapper runs this line after the CJS IIFE:
 *   window.L.control.locate = window.L.Control.Locate.locate
 * In the CJS path L.Control.Locate is never initialised by the library,
 * so reading .locate on undefined throws at bundle-load time.
 *
 * The fix in src/index.js pre-initialises L.Control.Locate = {} before
 * requiring the module, allowing the window-patching line to run safely
 * (it just sets window.L.control.locate = undefined — harmless).
 * The actual control is then created via the module's exported locate() factory.
 */
'use strict';

describe('leaflet.locatecontrol CJS compatibility — JS semantics', () => {
  test('reading .locate on undefined throws TypeError', () => {
    // Reproduces what the library does when L.Control.Locate is undefined.
    expect(() => {
      const locateNS = undefined;
      const _ = locateNS.locate; // eslint-disable-line no-unused-vars
    }).toThrow(TypeError);
  });

  test('pre-initialising namespace prevents the crash', () => {
    // Reproduces the guard added in src/index.js before the require().
    const Control = {};
    Control.Locate = Control.Locate || {};
    expect(() => {
      const control = { locate: undefined };
      control.locate = Control.Locate.locate; // reads undefined, no throw
    }).not.toThrow();
  });
});

describe('leaflet.locatecontrol module exports', () => {
  let mod;

  beforeAll(() => {
    // Replicate the guard from src/index.js: leaflet sets window.L = exports
    // even in the CJS path (leaflet-src.js:14509), so the locate control's
    // post-IIFE window-patching runs. Pre-initialising L.Control.Locate
    // prevents the "Cannot read .locate of undefined" crash.
    const L = require('leaflet');
    L.Control.Locate = L.Control.Locate || {};
    mod = require('leaflet.locatecontrol');
  });

  test('exports a locate factory function', () => {
    expect(typeof mod.locate).toBe('function');
  });

  test('exports a LocateControl class', () => {
    expect(typeof mod.LocateControl).toBe('function');
  });

  test('locate factory returns an object with addTo method', () => {
    const ctrl = mod.locate({ showPopup: false, locateOptions: {} });
    expect(ctrl).toBeDefined();
    expect(typeof ctrl.addTo).toBe('function');
  });

  test('locate factory accepts all options used in src/index.js', () => {
    const opts = {
      follow: false,
      setView: true,
      remainActive: false,
      keepCurrentZoomLevel: true,
      stopFollowingOnDrag: false,
      onLocationError: function(err) { void err; },
      onLocationOutsideMapBounds: function(ctx) { void ctx; },
      showPopup: false,
      locateOptions: {}
    };
    expect(() => mod.locate(opts)).not.toThrow();
  });
});
