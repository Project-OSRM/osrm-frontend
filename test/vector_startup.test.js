/** @jest-environment jsdom */
'use strict';

const L = require('leaflet');
const { createLayer } = require('../src/vector_layer');

test('fetches the bundled style before the renderer finishes loading and passes it without another style request', async () => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const map = L.map(container).setView([50.2, 8.58], 13);
  const originalFetch = window.fetch;
  let resolveStyle;
  window.fetch = jest.fn(() => new Promise(resolve => { resolveStyle = resolve; }));
  const events = new L.Evented();
  const renderer = new L.Layer();
  renderer.onAdd = () => {};
  renderer.onRemove = () => {};
  renderer.getMaplibreMap = () => events;
  const runtime = { createLayer: jest.fn(() => renderer) };
  try {
    const layer = createLayer('images/openstreetmap/style.json', { theme: 'original' }).addTo(map);
    const script = document.querySelector('script[src*="vector.js"]');
    expect(script).not.toBeNull();
    expect(window.fetch).toHaveBeenCalledTimes(1);
    expect(window.fetch.mock.calls[0][0]).toMatch(/\/images\/openstreetmap\/style\.json\?v=/);
    expect(document.querySelectorAll('link[data-osrm-sprite-preload]')).toHaveLength(2);
    const style = { version: 8, sources: {}, layers: [], sprite: './sprites' };
    resolveStyle({ ok: true, json: async () => style });
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(runtime.createLayer).not.toHaveBeenCalled();
    window.OSRMVector = runtime;
    script.dispatchEvent(new Event('load'));
    for (let i = 0; i < 6; i++) await Promise.resolve();
    expect(runtime.createLayer).toHaveBeenCalledWith(expect.objectContaining({ version: 8, sprite: 'http://localhost/images/openstreetmap/sprites' }), 'original');
    expect(layer.hasLayer(renderer)).toBe(true);
    expect(window.fetch).toHaveBeenCalledTimes(1);
  } finally {
    map.remove();
    container.remove();
    window.fetch = originalFetch;
    delete window.OSRMVector;
    document.querySelectorAll('script[src*="vector.js"], link[href*="vector.css"], link[data-osrm-sprite-preload]').forEach(element => element.remove());
  }
});
