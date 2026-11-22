'use strict';

const fs = require('node:fs');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');
let dom;
let watchdog;

beforeEach(() => {
  dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://example.org/new/' });
  const { window } = dom;
  window.setTimeout = jest.fn(callback => {
    watchdog = callback;
    return 1;
  });
  window.clearTimeout = jest.fn();
  window.console.error = jest.fn();
  const script = [...window.document.scripts].find(element => element.textContent.includes('function handleError('));
  window.eval(script.textContent);
});

afterEach(() => dom.window.close());

function overlay() {
  return dom.window.document.getElementById('osrm-error-overlay');
}

function markReady() {
  const { window } = dom;
  window.__osrm_app_loaded = true;
  window.dispatchEvent(new window.Event('osrm:ready'));
}

test('logs an opaque script error without blocking the demo', () => {
  const { window } = dom;
  window.dispatchEvent(new window.ErrorEvent('error', { message: 'Script error.' }));
  expect(window.console.error).toHaveBeenCalledTimes(1);
  expect(overlay()).toBeNull();
  expect(window.__osrm_last_error).toBeUndefined();
  markReady();
  expect(overlay()).toBeNull();
});

test('reports a real startup error with its source and reload control', () => {
  const { window } = dom;
  window.dispatchEvent(new window.ErrorEvent('error', {
    message: 'Could not initialize the map',
    filename: 'https://example.org/new/bundle.js',
    lineno: 12
  }));
  expect(overlay().querySelector('pre').textContent).toContain('Could not initialize the map (file: https://example.org/new/bundle.js, line: 12)');
  expect(overlay().querySelector('button').textContent).toBe('Reload');
});

test('clears the startup screen when a slow startup finishes', () => {
  watchdog();
  expect(overlay().querySelector('pre').textContent).toContain('did not finish startup within 5 seconds');
  markReady();
  expect(overlay()).toBeNull();
  expect(dom.window.clearTimeout).toHaveBeenCalledWith(1);
});

test('logs errors and rejections after startup without covering the map', () => {
  const { window } = dom;
  markReady();
  window.dispatchEvent(new window.ErrorEvent('error', { message: 'Script error.' }));
  window.dispatchEvent(new window.ErrorEvent('error', { message: 'An optional feature failed' }));
  const rejection = new window.Event('unhandledrejection');
  rejection.reason = new Error('An optional request failed');
  window.dispatchEvent(rejection);
  expect(window.console.error).toHaveBeenCalledTimes(3);
  expect(overlay()).toBeNull();
});
