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

test('passes the latest initial language and live changes to the existing renderer', async () => {
  const runtime = fakeRuntime();
  runtime.renderer.setLanguage = jest.fn();
  const loader = jest.fn(() => Promise.resolve(runtime));
  const layer = addVector(loader);
  layer.setLanguage('fr');
  await flush();
  expect(runtime.renderer.setLanguage).toHaveBeenLastCalledWith('fr');
  runtime.events.fire('load');
  layer.setLanguage('de');
  expect(runtime.renderer.setLanguage).toHaveBeenLastCalledWith('de');
  expect(runtime.createLayer).toHaveBeenCalledTimes(1);
  expect(runtime.renderer.onRemove).not.toHaveBeenCalled();
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

test('preserves inherited renderer sizing and pane defaults when adding attribution', async () => {
  Object.defineProperties(container, { clientWidth: { value: 1000 }, clientHeight: { value: 700 } });
  map.invalidateSize();
  const events = new L.Evented();
  const Renderer = L.Layer.extend({
    options: { padding: 0.1, pane: 'tilePane', updateInterval: 32 },
    initialize: function() { L.setOptions(this, { interactive: false }); },
    onAdd: function(leafletMap) {
      this.size = leafletMap.getSize().multiplyBy(1 + this.options.padding * 2);
    },
    onRemove: function() {},
    getMaplibreMap: () => events
  });
  const renderer = new Renderer();
  const options = renderer.options;
  addVector(() => Promise.resolve({ createLayer: () => renderer }));
  await flush();
  expect(renderer.options).toBe(options);
  expect(renderer.options.additionalAttribution).toBe('Local map');
  expect(renderer.options.pane).toBe('tilePane');
  expect(renderer.options.updateInterval).toBe(32);
  expect(renderer.size).toEqual(L.point(1200, 840));
});

test('translates an active vector loading message without restarting the renderer', async () => {
  const runtime = fakeRuntime();
  const loader = jest.fn(() => Promise.resolve(runtime));
  const layer = addVector(loader);
  layer.setLanguage('de');
  expect(container.querySelector('[role=status]').textContent).toBe('Vektorkarte wird geladen…');
  await flush();
  runtime.events.fire('error', { error: new Error('Style unavailable') });
  expect(container.querySelector('.osrm-vector-status button').textContent).toBe('Erneut versuchen');
  layer.setLanguage('fr');
  expect(container.querySelector('.osrm-vector-status button').textContent).toBe('Réessayer');
  expect(loader).toHaveBeenCalledTimes(1);
});


test('versions the bundled OpenStreetMap style so an older cached style cannot hide updated shields', async () => {
  const runtime = fakeRuntime();
  vectorLayers.createLayer('images/openstreetmap/style.json', { theme: 'original' }, () => Promise.resolve(runtime)).addTo(map);
  await flush();
  const url = new URL(runtime.createLayer.mock.calls[0][0]);
  expect(url.pathname).toBe('/images/openstreetmap/style.json');
  expect(url.searchParams.get('v')).toBeTruthy();
  expect(runtime.createLayer.mock.calls[0][1]).toBe('original');
});

test('retains mode changes during loading and hides access capability for suspended or custom backgrounds', async () => {
  let resolve;
  const runtime = fakeRuntime();
  runtime.renderer.setRoutingProfile = jest.fn();
  const layer = vectorLayers.createLayer('images/openstreetmap/style.json', {}, () => new Promise(done => { resolve = done; }));
  layer.setRoutingProfile('bike');
  layer.addTo(map);
  layer.setRoutingProfile('foot');
  resolve(runtime);
  await flush();
  expect(runtime.renderer.setRoutingProfile).toHaveBeenLastCalledWith('foot');
  expect(layer.getAccessProperty()).toBe('foot');
  layer.setVisible(false);
  expect(layer.getAccessProperty()).toBeNull();
  layer.setRoutingProfile('driving');
  layer.setVisible(true);
  expect(layer.getAccessProperty()).toBe('motorcar');
  layer.setRoutingProfile('unknown');
  expect(layer.getAccessProperty()).toBeNull();
  const custom = addVector(() => Promise.resolve(fakeRuntime()));
  custom.setRoutingProfile('driving');
  expect(custom.getAccessProperty()).toBeNull();
});
