/** @jest-environment jsdom */
'use strict';
const L = require('leaflet');
const { createRouteLineFactory, createSweepGeometry } = require('../src/route_reveal');
let map, container, originalSvg, factory;
const styles = [{ weight: 9, color: 'white' }, { weight: 6, color: 'blue', dashArray: '3,9' }];
beforeEach(() => {
  jest.useFakeTimers(); originalSvg = L.Browser.svg; L.Browser.svg = true;
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
function path(line) { return line.getLayers()[0].getElement(); }
function expectProgress(line, progress) {
  const points = line.getLayers()[0]._parts[0];
  const numbers = path(line).getAttribute('d').match(/-?[\d.]+/g).map(Number);
  const eased = progress * progress * (3 - 2 * progress);
  expect(numbers.at(-2)).toBeCloseTo(points[0].x + (points.at(-1).x - points[0].x) * eased, 5);
  expect(line.getLayers()[1].getElement().getAttribute('d')).toBe(path(line).getAttribute('d'));
}

test('continuously interpolates sparse segments and uneven vertex spacing', () => {
  const drawing = createSweepGeometry([[L.point(0, 0), L.point(10, 0), L.point(10, 90)]]);
  expect(drawing(0)).toBe('M0 0L0 0');
  expect(drawing(0.05)).toBe('M0 0L5 0');
  expect(drawing(0.25)).toBe('M0 0L10 0L10 15');
  expect(drawing(0.255)).toBe('M0 0L10 0L10 15.5');
  expect(drawing(1)).toBe('M0 0L10 0L10 90');
});

test('draws short and long routes continuously with the same 750 ms duration', () => {
  const lines = [add(route(0.001)), add(route(2))];
  lines.forEach(line => expect(path(line).style.visibility).toBe('hidden'));
  jest.advanceTimersByTime(20);
  jest.advanceTimersByTime(300);
  lines.forEach(line => expectProgress(line, 0.4));
  jest.advanceTimersByTime(449);
  lines.forEach(line => expect(line.getLayers()[0].options.noClip).toBe(true));
  jest.advanceTimersByTime(1);
  lines.forEach(line => {
    expect(line.getLayers()[0].options.noClip).toBe(false);
    expect(path(line).style.visibility).toBe('');
    expect(path(line).getAttribute('stroke-width')).toBe('9');
    expect(line.getLayers()[1].getElement().getAttribute('stroke-dasharray')).toBe('3,9');
  });
  expect(container.querySelectorAll('mask')).toHaveLength(0);
});

test('does not replay completed routes on selection or ordinary map moves', async () => {
  const value = route(0.02), line = add(value);
  await Promise.resolve();
  jest.advanceTimersByTime(770);
  map.setView([50.21, 8.6], 14, { animate: false });
  map.removeLayer(line);
  const selected = add(value);
  expect(path(selected).style.visibility).toBe('');
  expect(selected.getLayers()[0].options.noClip).toBe(false);
  expect(path(add(route(0.02))).style.visibility).toBe('hidden');
});

test('projects geometry after centering and then reveals it in the final viewport', () => {
  const line = add(route(0.02));
  map.setView([50.21, 8.6], 14, { animate: false });
  expect(path(line).style.visibility).toBe('hidden');
  jest.advanceTimersByTime(320);
  expectProgress(line, 0.4);
});

test('cancels an interrupted reveal and restores the original route', () => {
  const line = add(route(0.02));
  jest.advanceTimersByTime(200);
  map.fire('movestart');
  expect(line.getLayers()[0].options.noClip).toBe(false);
  expect(path(line).style.visibility).toBe('');
  expect(() => jest.advanceTimersByTime(1000)).not.toThrow();
});

test('cleans up when the route is replaced before revealing', () => {
  const line = add(route(0.02));
  map.removeLayer(line);
  expect(path(line).style.visibility).toBe('');
  expect(line.getLayers()[0].options.noClip).toBe(false);
  expect(L.Util.cancelAnimFrame).toHaveBeenCalled();
});

test('respects reduced motion', () => {
  window.matchMedia.mockReturnValue({ matches: true });
  const line = add(route(0.02));
  expect(path(line).style.visibility).toBe('');
  expect(line.getLayers()[0].options.noClip).toBe(false);
});

test('reveals the final line after synchronous initial alternative restoration', () => {
  const value = route(0.02), first = add(value);
  map.removeLayer(first);
  const final = add(value);
  expect(path(final).style.visibility).toBe('hidden');
  jest.advanceTimersByTime(770);
  expect(final.getLayers()[0].options.noClip).toBe(false);
});

test('waits for centering to end before its 750 ms sweep', () => {
  const line = add(route(0.02));
  map.fire('movestart');
  jest.advanceTimersByTime(1000);
  expect(path(line).style.visibility).toBe('hidden');
  map.fire('moveend');
  jest.advanceTimersByTime(320);
  expectProgress(line, 0.4);
  jest.advanceTimersByTime(450);
  expect(line.getLayers()[0].options.noClip).toBe(false);
});
