/**
 * @jest-environment jsdom
 */
'use strict';

const L = require('leaflet');
const vectorLayers = require('../src/vector_layer');
let map;
let container;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  map = L.map(container).setView([52.5, 13.4], 10);
});
afterEach(() => {
  map.remove();
  container.remove();
});

function fakeRuntime() {
  const events = new L.Evented();
  const renderer = new L.Layer();
  renderer.onAdd = () => {};
  renderer.onRemove = jest.fn();
  renderer.getMaplibreMap = () => events;
  return { renderer, events, createLayer: jest.fn(() => renderer) };
}

function addVector(loader) {
  return vectorLayers.createLayer('/styles/local.json', { attribution: 'Local map', minZoom: 1, maxZoom: 22 }, loader).addTo(map);
}

async function flush() { await Promise.resolve(); await Promise.resolve(); }

test('loads the renderer on selection and removes the raster fallback after the style loads', async () => {
  const runtime = fakeRuntime();
  const loader = jest.fn(() => Promise.resolve(runtime));
  const layer = addVector(loader);
  expect(layer.getLayers()).toHaveLength(1);
  await flush();
  expect(runtime.createLayer).toHaveBeenCalledWith('/styles/local.json', 'dark');
  expect(layer.getLayers()).toHaveLength(2);
  runtime.events.fire('load');
  expect(layer.getLayers()).toEqual([runtime.renderer]);
  expect(map.getMinZoom()).toBe(1);
  map.removeLayer(layer);
  expect(runtime.renderer.onRemove).toHaveBeenCalledTimes(1);
  expect(map.hasLayer(runtime.renderer)).toBe(false);
});

test('does not attach a late renderer after the user selects another background', async () => {
  let resolveRuntime;
  const runtime = fakeRuntime();
  const layer = addVector(() => new Promise(resolve => { resolveRuntime = resolve; }));
  map.removeLayer(layer);
  resolveRuntime(runtime);
  await flush();
  expect(runtime.createLayer).not.toHaveBeenCalled();
  expect(layer.getLayers()).toHaveLength(0);
});

test('keeps a raster map available when loading fails and can be selected again', async () => {
  const loader = jest.fn().mockRejectedValueOnce(new Error('network unavailable')).mockResolvedValueOnce(fakeRuntime());
  const layer = addVector(loader);
  const errors = jest.fn();
  layer.on('tileerror', errors);
  await flush();
  expect(errors).toHaveBeenCalledTimes(1);
  expect(layer.getLayers()).toHaveLength(1);
  map.removeLayer(layer);
  layer.addTo(map);
  await flush();
  expect(loader).toHaveBeenCalledTimes(2);
  expect(layer.getLayers()).toHaveLength(2);
});

test('retains the raster map if WebGL initialization throws', async () => {
  const layer = addVector(() => Promise.resolve({ createLayer: () => { throw new Error('WebGL unavailable'); } }));
  const errors = jest.fn();
  layer.on('tileerror', errors);
  await flush();
  expect(errors).toHaveBeenCalledTimes(1);
  expect(layer.getLayers()).toHaveLength(1);
});

test('removes a renderer whose onAdd fails so switching backgrounds remains safe', async () => {
  const runtime = fakeRuntime();
  runtime.renderer.onAdd = () => { throw new Error('WebGL unavailable'); };
  const layer = addVector(() => Promise.resolve(runtime));
  await flush();
  expect(layer.getLayers()).toHaveLength(1);
  expect(map.hasLayer(runtime.renderer)).toBe(false);
  expect(() => map.removeLayer(layer)).not.toThrow();
});

test('keeps the fallback visible if the style or tiles fail before the initial render', async () => {
  const runtime = fakeRuntime();
  const layer = addVector(() => Promise.resolve(runtime));
  await flush();
  runtime.events.fire('error', { error: new Error('Style unavailable') });
  runtime.events.fire('load');
  expect(layer.getLayers()).toHaveLength(1);
  expect(layer.hasLayer(runtime.renderer)).toBe(false);
});

test('loads local module and CSS assets on demand, retries a failed load, and reuses the runtime', async () => {
  const selector = 'script[src*="vector.js"]';
  expect(document.querySelector(selector)).toBeNull();
  let layer = addVector();
  let script = document.querySelector(selector);
  expect(script.type).toBe('module');
  expect(script.src).toMatch(/\/vector\.js\?v=/);
  expect(document.querySelector('link[href*="vector.css"]').href).toMatch(/\/vector\.css\?v=/);
  script.dispatchEvent(new Event('error'));
  await flush();
  expect(document.querySelector(selector)).toBeNull();
  map.removeLayer(layer);

  const runtime = fakeRuntime();
  window.OSRMVector = runtime;
  layer = addVector();
  script = document.querySelector(selector);
  script.dispatchEvent(new Event('load'));
  await flush();
  expect(layer.hasLayer(runtime.renderer)).toBe(true);
  map.removeLayer(layer);
  layer = addVector();
  await flush();
  expect(document.querySelectorAll(selector)).toHaveLength(1);
  expect(runtime.createLayer).toHaveBeenCalledTimes(2);
  delete window.OSRMVector;
  script.remove();
  document.querySelector('link[href*="vector.css"]').remove();
});
