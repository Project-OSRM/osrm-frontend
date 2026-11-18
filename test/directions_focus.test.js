/** @jest-environment jsdom */
'use strict';

const L = require('leaflet');
const viewport = require('../src/mobile_viewport');
const directionsFocus = require('../src/directions_focus');
let map;
let panel;
let height;
let control;
let waypoints;
let focus;
let camera;
let nativePan;
let selectRoute;

beforeEach(() => {
  document.documentElement.classList.add('osrm-theme-dark');
  document.body.innerHTML = '<div id="map"><section class="leaflet-routing-container dark"></section></div>';
  const container = document.getElementById('map');
  Object.defineProperties(container, { clientWidth: { value: 390 }, clientHeight: { value: 844 } });
  panel = container.firstChild;
  height = 506;
  panel.getBoundingClientRect = () => ({ width: 390, height });
  panel.innerHTML = '<div class="leaflet-routing-geocoders">' + [0, 1, 2].map(index => '<div class="leaflet-routing-geocoder"><span class="leaflet-routing-waypoint-pin"></span><input value="Stop ' + index + '"><span class="leaflet-routing-waypoint-handle"></span><span class="leaflet-routing-remove-waypoint"></span></div>').join('') + '</div>' +
    [0, 1].map(() => '<div class="leaflet-routing-alt"><details class="osrm-turn-list" open><table><tbody><tr><td><b>Depart</b></td></tr><tr><td>Arrive</td></tr></tbody></table></details></div>').join('');
  map = L.map(container, { zoomAnimation: false }).setView([50.2, 8.58], 15);
  camera = viewport.attach(map, panel);
  jest.spyOn(map, 'panTo').mockImplementation(function(center) { return this.setView(center, this.getZoom(), { animate: false }); });
  waypoints = [{ latLng: L.latLng(50.21, 8.57) }, { latLng: L.latLng(50.22, 8.58) }, { latLng: null }];
  control = { getWaypoints: () => waypoints, route: jest.fn(), setWaypoints: jest.fn(), _routes: [
    { coordinates: [L.latLng(50.21, 8.57), L.latLng(50.22, 8.58)], instructions: [{ index: 0 }, { index: 1 }] },
    { coordinates: [L.latLng(50.23, 8.59), L.latLng(50.24, 8.6)], instructions: [{ index: 0 }, { index: 1 }] }
  ] };
  nativePan = jest.fn();
  selectRoute = jest.fn();
  panel.querySelectorAll('tr').forEach(row => row.addEventListener('click', nativePan));
  panel.querySelectorAll('.leaflet-routing-alt').forEach(card => card.addEventListener('click', selectRoute));
  focus = directionsFocus.attach(map, control, panel);
});

afterEach(() => {
  focus.destroy();
  camera.destroy();
  map.remove();
  document.documentElement.classList.remove('osrm-theme-dark');
  document.body.replaceChildren();
  jest.restoreAllMocks();
});

function expectCentered(coordinate) {
  const point = map.latLngToContainerPoint(coordinate);
  expect(Math.abs(point.x - 195)).toBeLessThanOrEqual(1);
  expect(Math.abs(point.y - (844 - height) / 2)).toBeLessThanOrEqual(1);
  expect(map.getZoom()).toBe(15);
  expect(control.route).not.toHaveBeenCalled();
  expect(control.setWaypoints).not.toHaveBeenCalled();
}

test.each([169, 506, 760])('centers a clicked waypoint using the current %ipx pane without interrupting input editing', paneHeight => {
  height = paneHeight;
  const input = panel.querySelector('input');
  const selectInput = jest.fn();
  input.addEventListener('click', selectInput);
  input.click();
  expectCentered(waypoints[0].latLng);
  expect(selectInput).toHaveBeenCalledTimes(1);
  expect(input.value).toBe('Stop 0');
});

test('centers the displayed waypoint pin when routing uses a different entrance', () => {
  const pin = L.latLng(50.215, 8.575);
  waypoints[0]._entranceMarkerLatLng = pin;
  panel.querySelector('.leaflet-routing-waypoint-pin').click();
  expectCentered(pin);
});

test.each([0, 1])('centers instruction %i, including coordinate index zero, without a second pan or route selection', index => {
  panel.querySelectorAll('tr')[index].querySelector('td').click();
  expectCentered(control._routes[0].coordinates[index]);
  expect(map.panTo).toHaveBeenCalledTimes(1);
  expect(nativePan).not.toHaveBeenCalled();
  expect(selectRoute).not.toHaveBeenCalled();
});

test('uses the instruction coordinate from the clicked alternative', () => {
  panel.querySelectorAll('.leaflet-routing-alt')[1].querySelector('tr b').click();
  expectCentered(control._routes[1].coordinates[0]);
});

test('ignores empty waypoints, deletion, and reorder controls', () => {
  panel.querySelectorAll('input')[2].click();
  panel.querySelector('.leaflet-routing-remove-waypoint').click();
  panel.querySelector('.leaflet-routing-waypoint-handle').click();
  expect(map.panTo).not.toHaveBeenCalled();
});

test('resolves the current row after waypoints are reordered and stops handling clicks on unload', () => {
  waypoints.reverse();
  panel.querySelectorAll('input')[2].click();
  expectCentered(waypoints[2].latLng);
  map.panTo.mockClear();
  focus.destroy();
  panel.querySelectorAll('input')[2].click();
  expect(map.panTo).not.toHaveBeenCalled();
});
