/** @jest-environment jsdom */
'use strict';
const L = require('leaflet');
const { createBackgrounds } = require('../src/vector_backgrounds');

test('Standard and OpenStreetMap retain one renderer and tile cache across repeated switches', async () => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const map = L.map(container).setView([50, 8], 10);
  const events = new L.Evented();
  const renderer = new L.Layer();
  renderer.onAdd = jest.fn();
  renderer.onRemove = jest.fn();
  renderer.setTheme = jest.fn();
  renderer.getMaplibreMap = () => events;
  const runtime = { createLayer: jest.fn(() => renderer) };
  const loader = jest.fn(() => Promise.resolve(runtime));
  const backgrounds = createBackgrounds('/style.json', { theme: 'dark' }, loader);
  backgrounds.vector.addTo(map);
  await Promise.resolve();
  events.fire('load');
  for (const [previous, next] of [[backgrounds.vector, backgrounds.streets], [backgrounds.streets, backgrounds.vector]]) {
    map.removeLayer(previous);
    next.addTo(map);
    await Promise.resolve();
    expect(map.hasLayer(renderer)).toBe(true);
    expect(renderer.onRemove).not.toHaveBeenCalled();
  }
  expect(renderer.setTheme.mock.calls).toEqual([['original'], ['dark']]);
  expect(loader).toHaveBeenCalledTimes(1);
  expect(runtime.createLayer).toHaveBeenCalledTimes(1);
  map.removeLayer(backgrounds.vector);
  await Promise.resolve();
  expect(renderer.onRemove).toHaveBeenCalledTimes(1);
  map.remove();
  container.remove();
});

test('switching while the runtime loads applies the latest palette', async () => {
  const container = document.createElement('div');
  const map = L.map(container).setView([50, 8], 10);
  let resolve;
  const backgrounds = createBackgrounds('/style.json', { theme: 'dark' }, () => new Promise(done => { resolve = done; }));
  backgrounds.vector.addTo(map);
  map.removeLayer(backgrounds.vector);
  backgrounds.streets.addTo(map);
  const renderer = new L.Layer();
  renderer.onAdd = () => {};
  renderer.onRemove = () => {};
  renderer.getMaplibreMap = () => new L.Evented();
  const createLayer = jest.fn(() => renderer);
  resolve({ createLayer });
  await Promise.resolve();
  expect(createLayer).toHaveBeenCalledWith('/style.json', 'original');
  map.remove();
  await Promise.resolve();
});


test('forwards language changes to the shared loading status', () => {
  const container = document.createElement('div');
  const map = L.map(container).setView([50, 8], 10);
  const backgrounds = createBackgrounds('/style.json', { theme: 'dark' }, () => new Promise(() => {}));
  backgrounds.vector.addTo(map);
  backgrounds.vector.setLanguage('de');
  expect(container.querySelector('[role=status]').textContent).toBe('Vektorkarte wird geladen…');
  map.removeLayer(backgrounds.vector);
  backgrounds.streets.addTo(map);
  backgrounds.streets.setLanguage('fr');
  expect(container.querySelector('[role=status]').textContent).toBe('Chargement de la carte vectorielle…');
  map.remove();
});
