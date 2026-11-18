/** @jest-environment jsdom */
'use strict';

const fs = require('fs');
let loader;
let originalFetch;
let originalRatio;
const styleUrl = 'https://demo.example/osrm-vector-demo/images/openstreetmap/style.json?v=release';
const tileUrl = 'https://vector.openstreetmap.org/shortbread_v1/{z}/{x}/{y}.mvt';
const style = { version: 8, sources: { osm: { type: 'vector', tiles: [tileUrl] } }, layers: [], sprite: [{ id: 'basics', url: './sprites' }] };

beforeEach(() => {
  jest.resetModules();
  loader = require('../src/vector_style_loader');
  originalFetch = window.fetch;
  originalRatio = window.devicePixelRatio;
  window.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => style });
});

afterEach(() => {
  window.fetch = originalFetch;
  window.devicePixelRatio = originalRatio;
  document.querySelectorAll('link[data-osrm-sprite-preload]').forEach(link => link.remove());
});

test.each([1, 2])('starts the selected local style and %ix sprites together without downloading any tiles', async ratio => {
  window.devicePixelRatio = ratio;
  let resolveStyle;
  window.fetch.mockReturnValue(new Promise(resolve => { resolveStyle = resolve; }));
  const pending = loader.loadBundledStyle(styleUrl);
  expect(window.fetch).toHaveBeenCalledWith(styleUrl, { cache: 'default', referrerPolicy: 'strict-origin-when-cross-origin' });
  const links = [...document.querySelectorAll('link[data-osrm-sprite-preload]')];
  expect(links.map(link => link.href)).toEqual(['.json', '.png'].map(extension => 'https://demo.example/osrm-vector-demo/images/openstreetmap/sprites' + (ratio > 1 ? '@2x' : '') + extension));
  expect(links.every(link => link.rel === 'preload' && link.as === 'fetch' && link.crossOrigin === 'anonymous')).toBe(true);
  expect(loader.loadBundledStyle(styleUrl)).toBe(pending);
  expect(window.fetch).toHaveBeenCalledTimes(1);
  expect(document.querySelectorAll('link[data-osrm-sprite-preload]')).toHaveLength(2);
  resolveStyle({ ok: true, json: async () => style });
  const loaded = await pending;
  expect(loaded.sprite[0].url).toBe('https://demo.example/osrm-vector-demo/images/openstreetmap/sprites');
  expect(loaded.sources.osm.tiles).toEqual([tileUrl]);
  expect(style.sprite[0].url).toBe('./sprites');
});

test('retries a failed style response without duplicating sprite preloads', async () => {
  window.fetch.mockResolvedValueOnce({ ok: false, status: 503 });
  await expect(loader.loadBundledStyle(styleUrl)).rejects.toThrow('HTTP 503');
  await expect(loader.loadBundledStyle(styleUrl)).resolves.toHaveProperty('version', 8);
  expect(window.fetch).toHaveBeenCalledTimes(2);
  expect(document.querySelectorAll('link[data-osrm-sprite-preload]')).toHaveLength(2);
});

test('retries network and JSON failures rather than keeping a rejected style cached', async () => {
  window.fetch.mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce({ ok: true, json: async () => { throw new Error('Invalid JSON'); } });
  await expect(loader.loadBundledStyle(styleUrl)).rejects.toThrow('Offline');
  await expect(loader.loadBundledStyle(styleUrl)).rejects.toThrow('Invalid JSON');
  await expect(loader.loadBundledStyle(styleUrl)).resolves.toHaveProperty('version', 8);
});

test.each(['../index.html', '../debug/index.html'])('keeps a valid cross-origin referrer policy in %s', path => {
  const html = new DOMParser().parseFromString(fs.readFileSync(require.resolve(path), 'utf8'), 'text/html');
  expect(html.querySelector('meta[name="referrer"]').content).toBe('strict-origin-when-cross-origin');
});
