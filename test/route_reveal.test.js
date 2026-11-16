/** @jest-environment jsdom */
'use strict';
const L = require('leaflet');
const { createRouteLineFactory } = require('../src/route_reveal');
let map, container, originalSvg, factory;
const styles = [{ weight: 9, color: 'white' }, { weight: 6, color: 'blue', dashArray: '3,9' }];
beforeEach(() => {
  jest.useFakeTimers();
  originalSvg = L.Browser.svg;
  L.Browser.svg = true;
  window.matchMedia = jest.fn(() => ({ matches: false }));
  jest.spyOn(L.Util, 'requestAnimFrame').mockImplementation(fn => window.setTimeout(fn, 10));
  jest.spyOn(L.Util, 'cancelAnimFrame').mockImplementation(id => window.clearTimeout(id));
  container = document.createElement('div');
  Object.defineProperties(container, { clientWidth: { value: 1000 }, clientHeight: { value: 700 } });
  document.body.appendChild(container);
  map = L.map(container, { renderer: require('../src/fixed_width_renderer')(), zoomAnimation: false }).setView([50.2, 8.58], 13);
  factory = createRouteLineFactory((route, options) => L.layerGroup(options.styles.map(style => L.polyline(route.coordinates, style)), options));
});
afterEach(() => {
  map.remove(); container.remove(); L.Browser.svg = originalSvg;
  jest.clearAllTimers(); jest.restoreAllMocks(); jest.useRealTimers();
});
function route(length) { return { coordinates: [[50.2, 8.58], [50.2, 8.58 + length]] }; }
function add(value) { return factory(value, { styles }).addTo(map); }

test('sweeps short and long routes together and completes both in 750 ms', () => {
  const short = add(route(0.001)), long = add(route(2));
  expect(container.querySelectorAll('mask')).toHaveLength(4);
  jest.advanceTimersByTime(20); // Two quiet frames after camera centering.
  jest.advanceTimersByTime(300);
  container.querySelectorAll('mask path').forEach(path => {
    expect(path.getAttribute('pathLength')).toBe('1000');
    expect(path.getAttribute('stroke-dasharray')).toBe('400 1000');
  });
  jest.advanceTimersByTime(449);
  expect(container.querySelectorAll('mask')).toHaveLength(4);
  jest.advanceTimersByTime(1);
  expect(container.querySelectorAll('mask')).toHaveLength(0);
  for (const line of [short, long]) {
    expect(line.getLayers()[1].getElement().getAttribute('stroke-dasharray')).toBe('3,9');
    expect(line.getLayers()[0].getElement().getAttribute('stroke-width')).toBe('9');
    expect(line.getLayers()[0].getElement().getAttribute('mask')).toBeNull();
    expect(line.getLayers()[0].options.noClip).toBe(false);
  }
});

test('does not replay an existing route when alternatives are selected or the map moves', async () => {
  const value = route(0.02), line = add(value);
  await Promise.resolve();
  jest.advanceTimersByTime(770);
  map.setView([50.21, 8.6], 14, { animate: false });
  expect(container.querySelectorAll('mask')).toHaveLength(0);
  map.removeLayer(line);
  add(value);
  expect(container.querySelectorAll('mask')).toHaveLength(0);
  add(route(0.02));
  expect(container.querySelectorAll('mask')).toHaveLength(2);
});

test('keeps masks synchronized when route geometry is reprojected during the sweep', async () => {
  const line = add(route(0.02));
  const path = line.getLayers()[0].getElement();
  const maskId = path.getAttribute('mask').slice(5, -1);
  map.setView([50.21, 8.6], 14, { animate: false });
  await Promise.resolve();
  expect(container.querySelector('#' + maskId + ' path').getAttribute('d')).toBe(path.getAttribute('d'));
});

test('removes masks and cancels animation when a route is replaced early', () => {
  const line = add(route(0.02));
  jest.advanceTimersByTime(200);
  map.removeLayer(line);
  expect(container.querySelectorAll('mask')).toHaveLength(0);
  expect(L.Util.cancelAnimFrame).toHaveBeenCalled();
  expect(() => jest.advanceTimersByTime(1000)).not.toThrow();
});

test('shows the complete route immediately when reduced motion is requested', () => {
  window.matchMedia.mockReturnValue({ matches: true });
  const line = add(route(0.02));
  expect(container.querySelectorAll('mask')).toHaveLength(0);
  expect(line.getLayers()[0].options.noClip).toBe(false);
});


test('still reveals the final line when initial alternative restoration replaces it synchronously', () => {
  const value = route(0.02), first = add(value);
  map.removeLayer(first);
  add(value);
  expect(container.querySelectorAll('mask')).toHaveLength(2);
  jest.advanceTimersByTime(770);
  expect(container.querySelectorAll('mask')).toHaveLength(0);
});


test('waits for centering to finish before starting the full 750 ms reveal', () => {
  add(route(0.02));
  map.fire('movestart');
  jest.advanceTimersByTime(1000);
  container.querySelectorAll('mask path').forEach(path => expect(path.getAttribute('stroke-dasharray')).toBe('0 1000'));
  map.fire('moveend');
  jest.advanceTimersByTime(20);
  jest.advanceTimersByTime(300);
  container.querySelectorAll('mask path').forEach(path => expect(path.getAttribute('stroke-dasharray')).toBe('400 1000'));
  jest.advanceTimersByTime(450);
  expect(container.querySelectorAll('mask')).toHaveLength(0);
});

test('interrupting an active sweep exposes the full route instead of competing with camera motion', () => {
  add(route(0.02));
  jest.advanceTimersByTime(200);
  map.fire('movestart');
  expect(container.querySelectorAll('mask')).toHaveLength(0);
  expect(() => jest.advanceTimersByTime(1000)).not.toThrow();
});
