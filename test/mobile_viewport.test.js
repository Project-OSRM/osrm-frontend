/** @jest-environment jsdom */
'use strict';

const L = require('leaflet');
const viewport = require('../src/mobile_viewport');
const createState = require('../src/state');
const createLocationHandler = require('../src/location_handler');
let map;
let panel;
let controller;
let height;
let width;
let mapWidth;
let mapHeight;
const focus = L.latLng(50.118989, 8.690802);

beforeEach(() => {
  height = 506;
  width = 390;
  mapWidth = 390;
  mapHeight = 844;
  document.documentElement.classList.add('osrm-theme-dark');
  document.body.innerHTML = '<div id="map"><div class="leaflet-routing-container"></div></div>';
  const container = document.getElementById('map');
  Object.defineProperties(container, { clientWidth: { get: () => mapWidth }, clientHeight: { get: () => mapHeight } });
  panel = container.firstChild;
  panel.getBoundingClientRect = () => ({ width, height });
  map = L.map(container, { zoomAnimation: false, fadeAnimation: false }).setView(focus, 15);
  controller = viewport.attach(map, panel);
  map.setView(viewport.centerForTarget(map, focus, 15), 15, { animate: false });
});

afterEach(() => {
  controller.destroy();
  map.remove();
  document.documentElement.classList.remove('osrm-theme-dark');
  document.body.replaceChildren();
  jest.restoreAllMocks();
});

function expectVisibleCenter(target = focus) {
  const hidden = panel.classList.contains('leaflet-routing-container-hide');
  const covered = hidden || width < mapWidth - 1 ? 0 : height;
  const coveredLeft = !hidden && width < mapWidth - 1 && mapWidth <= 900 ? width : 0;
  const point = map.latLngToContainerPoint(target);
  expect(Math.abs(point.x - (mapWidth + coveredLeft) / 2)).toBeLessThanOrEqual(1);
  expect(Math.abs(point.y - (mapHeight - covered) / 2)).toBeLessThanOrEqual(1);
}

test('centers the same location above the sheet at compact, medium, and expanded sizes without changing zoom', () => {
  expectVisibleCenter();
  for (height of [169, 506, 760, 169]) {
    controller.update();
    expectVisibleCenter();
    expect(map.getZoom()).toBe(15);
  }
});

test('follows continuous dragging without accumulating pixel rounding drift', () => {
  map.options.zoomSnap = 0;
  const resetView = jest.fn();
  map.on('viewreset', resetView);
  for (let cycle = 0; cycle < 3; cycle++) {
    for (height = 506; height >= 169; height--) controller.update();
    for (height = 169; height <= 506; height++) controller.update();
  }
  height = 506;
  controller.update();
  expectVisibleCenter();
  expect(resetView).not.toHaveBeenCalled();
});

test('preserves the place the user panned to while opening, closing, or resizing the sheet', () => {
  map.panBy([110, -35], { animate: false });
  const pannedFocus = viewport.getCenter(map);
  panel.classList.add('leaflet-routing-container-hide');
  controller.update();
  expectVisibleCenter(pannedFocus);
  panel.classList.remove('leaflet-routing-container-hide');
  height = 760;
  controller.update();
  expectVisibleCenter(pannedFocus);
});

test('anchors zoom buttons in the visible area rather than moving a location behind the sheet', () => {
  map.zoomIn(1, { animate: false });
  expect(map.getZoom()).toBe(16);
  expectVisibleCenter();
  height = 169;
  controller.update();
  map.zoomOut(1, { animate: false });
  expect(map.getZoom()).toBe(15);
  expectVisibleCenter();
});

test('does not let an unfinished camera pan undo a pane resize', async () => {
  map.panTo(viewport.centerForTarget(map, L.latLng(50.1193, 8.691), 15), { animate: true, duration: 0.2 });
  height = 169;
  controller.update();
  const stoppedFocus = viewport.getCenter(map);
  await new Promise(resolve => setTimeout(resolve, 300));
  expectVisibleCenter(stoppedFocus);
});

test('preserves the visible focus when resizing from a phone to a tablet and a landscape sidebar', () => {
  mapWidth = width = 834;
  mapHeight = 1112;
  height = 222;
  map.invalidateSize({ pan: true });
  controller.update();
  expectVisibleCenter();
  mapWidth = 844;
  mapHeight = height = 390;
  width = 360;
  map.invalidateSize({ pan: true });
  controller.update();
  expectVisibleCenter();
  map.zoomIn(1, { animate: false });
  expectVisibleCenter();
  mapWidth = 1200;
  mapHeight = height = 800;
  width = 360;
  map.invalidateSize({ pan: true });
  controller.update();
  expectVisibleCenter();
  expect(map.getZoom()).toBe(16);
});

test('stores the visible center and restores it using the current sheet size, without applying an offset twice', async () => {
  const plan = new L.Evented();
  const control = { getPlan: () => plan, setWaypoints() {} };
  const state = createState(map, control, new L.Evented(), null, { center: focus, zoom: 15, waypoints: [] });
  expectVisibleCenter();
  height = 169;
  controller.update();
  const savedPoint = map.project(state.options.center);
  expect(savedPoint.distanceTo(map.project(focus))).toBeLessThanOrEqual(1);
  height = 760;
  const settled = new Promise(resolve => map.once('moveend', resolve));
  state.set({ center: focus, zoom: 15 });
  controller.update();
  await settled;
  expectVisibleCenter();
  state.set({ center: L.latLng(50.12, 8.7), zoom: 14 });
  expectVisibleCenter(L.latLng(50.12, 8.7));
});

test('keeps an initial location fix above the pane without following passive fixes while a route exists', () => {
  const control = { _routes: [] };
  const locate = createLocationHandler(map, control);
  locate({ latlng: focus });
  expect(map.getZoom()).toBe(14);
  expectVisibleCenter();
  map.setZoom(16, { animate: false });
  height = 169;
  controller.update();
  control._routes = [{}];
  const center = map.getCenter();
  locate({ latlng: L.latLng(50.12, 8.7) });
  expect(map.getZoom()).toBe(16);
  expect(map.getCenter()).toEqual(center);
});

test('adjusts cached LocateControl camera requests while preserving the real marker location and caller options', () => {
  const applyView = jest.fn((method, args) => map[method](...args));
  const control = { _setViewIgnoringEvents: applyView, _event: { latlng: focus } };
  viewport.configureLocationControl(map, control);
  const panOptions = { animate: false };
  control._setViewIgnoringEvents('panTo', [focus, panOptions]);
  expectVisibleCenter();
  expect(control._event.latlng).toBe(focus);
  expect(applyView.mock.calls[0][1][1]).toBe(panOptions);
  const fitOptions = { padding: [10, 20], maxZoom: 14, animate: false };
  control._setViewIgnoringEvents('fitBounds', [L.latLngBounds([50.118, 8.69], [50.12, 8.692]), fitOptions]);
  expect(applyView.mock.calls[1][1][1].paddingBottomRight).toEqual(L.point(10, 526));
  expect(fitOptions).toEqual({ padding: [10, 20], maxZoom: 14, animate: false });
});

test('retains ordinary centering and zooming for a sidebar, a hidden pane, and the classic interface', () => {
  mapWidth = 1200;
  width = 300;
  map.invalidateSize({ pan: true });
  controller.update();
  expect(viewport.centerForTarget(map, focus, 15)).toBe(focus);
  expectVisibleCenter();
  document.documentElement.classList.remove('osrm-theme-dark');
  width = 390;
  controller.update();
  map.setView(focus, 15, { animate: false });
  map.zoomIn(1, { animate: false });
  expect(map.getCenter().distanceTo(focus)).toBeLessThan(5);
});
