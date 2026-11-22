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
  const grid = container.querySelector('.osrm-vector-loading-grid');
  expect(grid?.getAttribute('aria-hidden')).toBe('true');
  await flush();
  expect(runtime.createLayer).toHaveBeenCalledWith('/styles/local.json', 'dark');
  expect(layer.getLayers()).toEqual([runtime.renderer]);
  runtime.events.fire('styledata');
  expect(container.contains(grid)).toBe(true);
  runtime.events.fire('load');
  expect(container.querySelector('[role=status]')).toBeNull();
  expect(container.contains(grid)).toBe(false);
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
  expect(container.querySelector('.osrm-vector-loading-grid')).toBeNull();
});

test('matches the selected palette and clears the grid over other backgrounds', () => {
  const layer = vectorLayers.createLayer('/style.json', { theme: 'original' }, () => new Promise(() => {})).addTo(map);
  const grid = () => container.querySelector('.osrm-vector-loading-grid');
  expect(grid()?.classList.contains('osrm-vector-loading-grid-dark')).toBe(false);
  layer.setTheme('dark');
  expect(grid()?.classList.contains('osrm-vector-loading-grid-dark')).toBe(true);
  layer.setTheme('satellite');
  expect(grid()).toBeNull();
  layer.setVisible(false);
  layer.setTheme('original');
  expect(grid()).toBeNull();
  layer.setVisible(true);
  expect(grid()).not.toBeNull();
  map.removeLayer(layer);
  expect(grid()).toBeNull();
});

test('offers a retry after loading fails, without starting a raster basemap', async () => {
  const runtime = fakeRuntime();
  const loader = jest.fn().mockRejectedValueOnce(new Error('network unavailable')).mockResolvedValueOnce(runtime);
  const layer = addVector(loader);
  const errors = jest.fn();
  const mapClicks = jest.fn();
  const grid = () => container.querySelector('.osrm-vector-loading-grid');
  layer.on('tileerror', errors);
  map.on('click', mapClicks);
  await flush();
  expect(errors).toHaveBeenCalledTimes(1);
  expect(layer.getLayers()).toHaveLength(0);
  expect(grid()).toBeNull();
  const button = container.querySelector('.osrm-vector-status button');
  expect(button.type).toBe('button');
  expect(button.textContent).toBe('Try again');
  button.click();
  expect(grid()).not.toBeNull();
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

test.each([false, true])('keeps a renderer after its first tile fails (overlay %s)', async overlay => {
  const runtime = fakeRuntime();
  const layer = vectorLayers.createLayer('/styles/local.json', { overlay }, () => Promise.resolve(runtime)).addTo(map);
  const errors = jest.fn();
  layer.on('tileerror', errors);
  await flush();
  const failure = new Error('Tile returned HTTP 503');
  const tile = { tileID: { canonical: { z: 9, x: 3, y: 5 } } };
  runtime.events.fire('error', { error: failure, tile });
  expect(map.hasLayer(runtime.renderer)).toBe(true);
  expect(Boolean(container.querySelector('.osrm-vector-loading-grid'))).toBe(!overlay);
  expect(container.querySelector('.osrm-vector-status-error')).toBeNull();
  expect(errors).toHaveBeenCalledWith(expect.objectContaining({ error: failure }));
  runtime.events.fire('load');
  runtime.events.fire('error', { error: failure, tile });
  expect(map.hasLayer(runtime.renderer)).toBe(true);
  expect(container.querySelector('.osrm-vector-status')).toBeNull();
});

test('hides a suspended renderer’s failure banner even with the theme stylesheet loaded', async () => {
  const css = document.createElement('style');
  css.textContent = require('node:fs').readFileSync(require.resolve('../css/theme.css'), 'utf8');
  document.head.appendChild(css);
  try {
    const layer = addVector(() => Promise.reject(new Error('Style unavailable')));
    await flush();
    const status = container.querySelector('.osrm-vector-status-error');
    expect(window.getComputedStyle(status).display).toBe('flex');
    layer.setVisible(false);
    expect(window.getComputedStyle(status).display).toBe('none');
    layer.setVisible(true);
    expect(window.getComputedStyle(status).display).toBe('flex');
  } finally {
    css.remove();
  }
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
