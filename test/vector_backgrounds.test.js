/** @jest-environment jsdom */
'use strict';
const L = require('leaflet');
const { createBackgrounds } = require('../src/vector_backgrounds');

test('Dark Vector and OpenStreetMap retain one renderer and tile cache across repeated switches', async () => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const map = L.map(container).setView([50, 8], 10);
  const events = new L.Evented();
  const renderer = new L.Layer();
  renderer.onAdd = jest.fn();
  renderer.onRemove = jest.fn();
  renderer.setTheme = jest.fn();
  renderer.setVisible = jest.fn();
  renderer.setRoutingProfile = jest.fn();
  renderer.getMaplibreMap = () => events;
  const runtime = { createLayer: jest.fn(() => renderer) };
  const loader = jest.fn(() => Promise.resolve(runtime));
  const backgrounds = createBackgrounds('/style.json', { theme: 'dark' }, loader);
  backgrounds.vector.addTo(map);
  await Promise.resolve();
  events.fire('load');
  backgrounds.vector.setRoutingProfile('driving');
  expect(backgrounds.vector.getAccessProperty()).toBeNull(); // Custom style has no access layers.
  for (const [previous, next] of [[backgrounds.vector, backgrounds.streets], [backgrounds.streets, backgrounds.vector]]) {
    map.removeLayer(previous);
    next.addTo(map);
    await Promise.resolve();
    next.setRoutingProfile('bike');
    expect(map.hasLayer(renderer)).toBe(true);
    expect(renderer.onRemove).not.toHaveBeenCalled();
  }
  expect(renderer.setTheme.mock.calls).toEqual([['original'], ['dark']]);
  expect(loader).toHaveBeenCalledTimes(1);
  expect(runtime.createLayer).toHaveBeenCalledTimes(1);
  expect(renderer.setRoutingProfile).toHaveBeenLastCalledWith('bike');
  map.removeLayer(backgrounds.vector);
  await Promise.resolve();
  expect(renderer.onRemove).not.toHaveBeenCalled();
  expect(renderer.setVisible).toHaveBeenLastCalledWith(false);
  // A later return from a raster background reuses the loaded renderer too.
  backgrounds.streets.addTo(map);
  await Promise.resolve();
  expect(renderer.setVisible).toHaveBeenLastCalledWith(true);
  expect(runtime.createLayer).toHaveBeenCalledTimes(1);
  map.remove();
  expect(renderer.onRemove).toHaveBeenCalledTimes(1);
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


test('keeps loading tiles cached while hidden without displaying status or imposing zoom limits', async () => {
  const container = document.createElement('div');
  const map = L.map(container).setView([50, 8], 10);
  const backgrounds = createBackgrounds('/style.json', { theme: 'dark', minZoom: 1, maxZoom: 22 }, () => new Promise(() => {}));
  backgrounds.vector.addTo(map);
  expect(map.getMaxZoom()).toBe(22);
  map.removeLayer(backgrounds.vector);
  await Promise.resolve();
  expect(container.querySelector('[role=status]').hidden).toBe(true);
  expect(map.getMaxZoom()).toBe(Infinity);
  backgrounds.streets.addTo(map);
  expect(container.querySelector('[role=status]').hidden).toBe(false);
  expect(map.getMaxZoom()).toBe(22);
  map.remove();
});

test('shares one cached renderer with the optional satellite overlay and restores full backgrounds', async () => {
  const container = document.createElement('div');
  const map = L.map(container).setView([50, 8], 15);
  const satellite = L.layerGroup();
  satellite.options.maxZoom = 19;
  const events = new L.Evented();
  const renderer = new L.Layer();
  renderer.onAdd = jest.fn();
  renderer.onRemove = jest.fn();
  renderer.setTheme = jest.fn();
  renderer.setVisible = jest.fn();
  renderer.setLanguage = jest.fn();
  renderer.setRoutingProfile = jest.fn();
  renderer.getMaplibreMap = () => events;
  const runtime = { createLayer: jest.fn(() => renderer) };
  const loader = jest.fn(() => Promise.resolve(runtime));
  const backgrounds = createBackgrounds('/style.json', { theme: 'dark', minZoom: 1, maxZoom: 22, satelliteLayer: satellite }, loader);
  backgrounds.streets.addTo(map);
  await Promise.resolve();
  events.fire('load');
  backgrounds.satelliteStreets.addTo(map);
  expect(renderer.setTheme).not.toHaveBeenLastCalledWith('satellite');
  map.removeLayer(backgrounds.streets);
  satellite.addTo(map);
  await Promise.resolve();
  expect(renderer.setTheme).toHaveBeenLastCalledWith('satellite');
  expect(map.getMaxZoom()).toBe(19);
  backgrounds.satelliteStreets.setLanguage('fr');
  backgrounds.satelliteStreets.setRoutingProfile('bike');
  expect(renderer.setLanguage).toHaveBeenLastCalledWith('fr');
  expect(renderer.setRoutingProfile).toHaveBeenLastCalledWith('bike');
  map.removeLayer(backgrounds.satelliteStreets);
  await Promise.resolve();
  expect(renderer.setVisible).toHaveBeenLastCalledWith(false);
  backgrounds.satelliteStreets.addTo(map);
  expect(renderer.setVisible).toHaveBeenLastCalledWith(true);
  map.removeLayer(satellite);
  backgrounds.vector.addTo(map);
  await Promise.resolve();
  expect(renderer.setTheme).toHaveBeenLastCalledWith('dark');
  expect(map.getMaxZoom()).toBe(22);
  map.removeLayer(backgrounds.vector);
  await Promise.resolve();
  expect(renderer.setVisible).toHaveBeenLastCalledWith(false);
  satellite.addTo(map);
  await Promise.resolve();
  expect(renderer.setTheme).toHaveBeenLastCalledWith('satellite');
  expect(renderer.setVisible).toHaveBeenLastCalledWith(true);
  expect(runtime.createLayer).toHaveBeenCalledTimes(1);
  expect(loader).toHaveBeenCalledTimes(1);
  expect(renderer.onRemove).not.toHaveBeenCalled();
  map.remove();
  await Promise.resolve();
  expect(renderer.onRemove).toHaveBeenCalledTimes(1);
});

test('does not fetch vector tiles on a plain satellite view until the overlay is enabled', async () => {
  const map = L.map(document.createElement('div')).setView([50, 8], 15);
  const satellite = L.layerGroup().addTo(map);
  const loader = jest.fn(() => new Promise(() => {}));
  const backgrounds = createBackgrounds('/style.json', { satelliteLayer: satellite }, loader);
  expect(loader).not.toHaveBeenCalled();
  backgrounds.satelliteStreets.addTo(map);
  expect(loader).toHaveBeenCalledTimes(1);
  map.remove();
  await Promise.resolve();
});

test('uses the latest satellite choice when the shared renderer finishes loading', async () => {
  const map = L.map(document.createElement('div')).setView([50, 8], 15);
  const satellite = L.layerGroup();
  satellite.options.maxZoom = 19;
  let resolve;
  const backgrounds = createBackgrounds('/style.json', { theme: 'dark', satelliteLayer: satellite }, () => new Promise(done => { resolve = done; }));
  backgrounds.vector.addTo(map);
  map.removeLayer(backgrounds.vector);
  satellite.addTo(map);
  backgrounds.satelliteStreets.addTo(map);
  backgrounds.satelliteStreets.setLanguage('de');
  const renderer = new L.Layer();
  renderer.onAdd = () => {};
  renderer.onRemove = () => {};
  renderer.setLanguage = jest.fn();
  renderer.getMaplibreMap = () => new L.Evented();
  const createLayer = jest.fn(() => renderer);
  resolve({ createLayer });
  await Promise.resolve();
  expect(createLayer).toHaveBeenCalledWith('/style.json', 'satellite');
  expect(renderer.setLanguage).toHaveBeenCalledWith('de');
  map.remove();
  await Promise.resolve();
});
