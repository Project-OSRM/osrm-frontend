/** @jest-environment jsdom */
'use strict';
const L = require('leaflet');
const { createLayer } = require('../src/small_components');
let map, container, runtime, styles;
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  map = L.map(container).setView([37.37, -122], 14);
  styles = [];
  runtime = { createLayer: jest.fn(style => {
    styles.push(style);
    const renderer = new L.Layer();
    renderer.onAdd = () => {};
    renderer.onRemove = jest.fn();
    const events = new L.Evented();
    renderer.getMaplibreMap = () => events;
    return renderer;
  }) };
});
afterEach(() => { map.remove(); container.remove(); });
async function flush() { await Promise.resolve(); await Promise.resolve(); }
const service = profile => ({ path: 'https://router.example/' + profile + '/route/v1', profile });

test('initial selection, mode changes and return from history replace only the component source', async () => {
  const layer = createLayer(() => Promise.resolve(runtime));
  layer.setService(service('car'));
  layer.addTo(map);
  await flush();
  for (const profile of ['bike', 'foot', 'car']) {
    layer.setService(service(profile));
    await flush();
    expect(map.hasLayer(layer)).toBe(true);
    expect(styles.at(-1).sources.osrm.tiles[0]).toContain('/' + profile + '/tile/v1/' + profile + '/');
  }
  expect(runtime.createLayer).toHaveBeenCalledTimes(4);
  expect(map.getMinZoom()).toBe(0);
});

test('preserves a disabled checkbox across mode changes and starts the latest source when enabled', async () => {
  const layer = createLayer(() => Promise.resolve(runtime));
  layer.setService(service('car'));
  layer.addTo(map);
  await flush();
  map.removeLayer(layer);
  layer.setService(service('bike'));
  expect(map.hasLayer(layer)).toBe(false);
  expect(container.querySelector('.osrm-vector-status')).toBeNull();
  layer.addTo(map);
  await flush();
  expect(styles.at(-1).sources.osrm.tiles[0]).toContain('/bike/tile/v1/bike/');
});

test('gives an unavailable state without external requests for a mode with no tile capability', async () => {
  const layer = createLayer(() => Promise.resolve(runtime));
  layer.setService({ path: '/custom/api', tileUrl: false });
  layer.addTo(map);
  await flush();
  expect(container.querySelector('[role=status]').textContent).toContain('unavailable');
  expect(runtime.createLayer).not.toHaveBeenCalled();
});

test('requests no tiles below the supported zoom and keeps the map zoom range unchanged', async () => {
  map.setZoom(10);
  const layer = createLayer(() => Promise.resolve(runtime));
  layer.setService(service('car'));
  layer.addTo(map);
  await flush();
  expect(runtime.createLayer).not.toHaveBeenCalled();
  expect(container.querySelector('[role=status]').textContent).toContain('level 13');
  map.setZoom(13);
  await flush();
  expect(runtime.createLayer).toHaveBeenCalledTimes(1);
  expect(map.getMinZoom()).toBe(0);
});


test('reports a failing tile service after style load instead of silently showing no components', async () => {
  const layer = createLayer(() => Promise.resolve(runtime));
  layer.setService(service('car'));
  layer.addTo(map);
  await flush();
  const events = layer._renderer.getLayers()[0].getMaplibreMap();
  events.fire('load');
  events.fire('error', { error: new Error('404 tile endpoint unavailable') });
  expect(container.querySelector('[role=status]').textContent).toContain('Small Components unavailable');
  expect(layer._renderer.getLayers()).toHaveLength(0);
});
