/** @jest-environment jsdom */
'use strict';
const L = require('leaflet');
const createRenderer = require('../src/fixed_width_renderer');
let map;
let container;
let renderer;
let path;
let originalSvg;

beforeEach(() => {
  originalSvg = L.Browser.svg;
  L.Browser.svg = true;
  container = document.createElement('div');
  Object.defineProperties(container, { clientWidth: { value: 1000 }, clientHeight: { value: 700 } });
  document.body.appendChild(container);
  renderer = createRenderer();
  map = L.map(container, { renderer, zoomAnimation: false }).setView([50.2, 8.58], 13);
  path = L.polyline([[50.2, 8.55], [50.21, 8.6]], { weight: 6 }).addTo(map);
});
afterEach(() => {
  map.remove();
  container.remove();
  L.Browser.svg = originalSvg;
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test.each([11.5, 13.3, 15, 17])('zooms geometry inside SVG with fixed stroke width at zoom %s', zoom => {
  const center = L.latLng(50.205, 8.59);
  const baseZoom = renderer._zoom;
  const baseCenter = renderer._center;
  const boundsMin = renderer._bounds.min;
  const point = path._rings[0][0];
  renderer._updateTransform(center, zoom);
  const scale = map.getZoomScale(zoom, baseZoom);
  // Compare against Leaflet's original outer-SVG camera transform.
  const offset = map.getSize().multiplyBy(0.5 + renderer.options.padding).multiplyBy(-scale)
    .add(map.project(baseCenter, zoom)).subtract(map._getNewPixelOrigin(center, zoom));
  const expected = point.subtract(boundsMin).multiplyBy(scale).add(offset);
  const actual = point.multiplyBy(renderer._geometry.scale).add(renderer._geometry.offset);
  expect(actual.distanceTo(expected)).toBeLessThan(0.000001);
  expect(renderer._rootGroup.getAttribute('transform')).toContain('matrix(');
  expect(renderer._container.style.transform).not.toContain('scale');
  expect(renderer._container.classList.contains('leaflet-zoom-animated')).toBe(false);
  expect(path._path.getAttribute('vector-effect')).toBe('non-scaling-stroke');
  expect(path._path.getAttribute('stroke-width')).toBe('6');
});

test('animates button zooms without scaling the outer SVG and cancels on removal', () => {
  jest.useFakeTimers();
  jest.spyOn(L.Util, 'requestAnimFrame').mockImplementation((fn, context) => window.setTimeout(() => fn.call(context), 16));
  jest.spyOn(L.Util, 'cancelAnimFrame').mockImplementation(id => window.clearTimeout(id));
  renderer._onAnimZoom({ center: map.getCenter(), zoom: 14 });
  jest.advanceTimersByTime(125);
  expect(renderer._geometry.scale).toBeGreaterThan(1);
  expect(renderer._geometry.scale).toBeLessThan(2);
  expect(renderer._container.style.transform).not.toContain('scale');
  expect(path._path.getAttribute('stroke-width')).toBe('6');
  jest.advanceTimersByTime(150);
  expect(renderer._geometry.scale).toBe(2);
  renderer._onAnimZoom({ center: map.getCenter(), zoom: 15 });
  map.removeLayer(path);
  map.removeLayer(renderer);
  expect(renderer._zoomFrame).toBeUndefined();
});

test('resets the inner transform when geometry is projected at the final zoom', () => {
  renderer._updateTransform(map.getCenter(), 14);
  map.setView(map.getCenter(), 14, { animate: false });
  expect(renderer._geometry.scale).toBe(1);
  expect(path._path.getAttribute('stroke-width')).toBe('6');
});
