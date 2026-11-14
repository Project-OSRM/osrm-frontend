/**
 * @jest-environment jsdom
 */
'use strict';

const L = require('leaflet');
const vectorLayers = require('../src/vector_layer');
let map;
let container;
let tileLayerSpy;

beforeEach(() => {
  tileLayerSpy = jest.spyOn(L, 'tileLayer');
  container = document.createElement('div');
  document.body.appendChild(container);
  map = L.map(container).setView([52.5, 13.4], 10);
});
afterEach(() => {
  map.remove();
  container.remove();
  expect(tileLayerSpy).not.toHaveBeenCalled();
  tileLayerSpy.mockRestore();
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

test('loads the vector renderer directly without requesting raster tiles', async () => {
  const runtime = fakeRuntime();
  const loader = jest.fn(() => Promise.resolve(runtime));
  const layer = addVector(loader);
  expect(layer.getLayers()).toHaveLength(0);
  expect(container.querySelector('[role=status]').textContent).toBe('Loading vector map…');
  await flush();
  expect(runtime.createLayer).toHaveBeenCalledWith('/styles/local.json', 'dark');
  expect(layer.getLayers()).toEqual([runtime.renderer]);
  runtime.events.fire('load');
  expect(container.querySelector('[role=status]')).toBeNull();
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
  expect(container.querySelector('.osrm-vector-status')).toBeNull();
});

test('offers a retry after loading fails, without starting a raster basemap', async () => {
  const runtime = fakeRuntime();
  const loader = jest.fn().mockRejectedValueOnce(new Error('network unavailable')).mockResolvedValueOnce(runtime);
  const layer = addVector(loader);
  const errors = jest.fn();
  const mapClicks = jest.fn();
  layer.on('tileerror', errors);
  map.on('click', mapClicks);
  await flush();
  expect(errors).toHaveBeenCalledTimes(1);
  expect(layer.getLayers()).toHaveLength(0);
  const button = container.querySelector('.osrm-vector-status button');
  expect(button.type).toBe('button');
  expect(button.textContent).toBe('Try again');
  button.click();
  await flush();
  expect(loader).toHaveBeenCalledTimes(2);
  expect(layer.getLayers()).toEqual([runtime.renderer]);
  expect(mapClicks).not.toHaveBeenCalled();
  runtime.events.fire('load');
  expect(container.querySelector('.osrm-vector-status')).toBeNull();
});

test('shows a loading error if WebGL initialization throws', async () => {
  const layer = addVector(() => Promise.resolve({ createLayer: () => { throw new Error('WebGL unavailable'); } }));
  const errors = jest.fn();
  layer.on('tileerror', errors);
  await flush();
  expect(errors).toHaveBeenCalledTimes(1);
  expect(layer.getLayers()).toHaveLength(0);
  expect(container.querySelector('.osrm-vector-status-error').textContent).toContain('Vector map could not load');
});

test('removes a partially initialized renderer so switching backgrounds stays safe', async () => {
  const runtime = fakeRuntime();
  runtime.renderer.onAdd = () => { throw new Error('WebGL unavailable'); };
  const layer = addVector(() => Promise.resolve(runtime));
  await flush();
  expect(layer.getLayers()).toHaveLength(0);
  expect(map.hasLayer(runtime.renderer)).toBe(false);
  expect(() => map.removeLayer(layer)).not.toThrow();
  expect(container.querySelector('.osrm-vector-status')).toBeNull();
});

test('keeps an error visible if the style fails before the first render', async () => {
  const runtime = fakeRuntime();
  const layer = addVector(() => Promise.resolve(runtime));
  await flush();
  runtime.events.fire('error', { error: new Error('Style unavailable') });
  runtime.events.fire('load');
  expect(layer.getLayers()).toHaveLength(0);
  expect(container.querySelector('.osrm-vector-status-error')).not.toBeNull();
});

test('retains the rendered map after a later tile error without switching to raster', async () => {
  const runtime = fakeRuntime();
  const layer = addVector(() => Promise.resolve(runtime));
  await flush();
  runtime.events.fire('load');
  runtime.events.fire('error', { error: new Error('One tile failed') });
  expect(layer.getLayers()).toEqual([runtime.renderer]);
  expect(container.querySelector('.osrm-vector-status')).toBeNull();
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
