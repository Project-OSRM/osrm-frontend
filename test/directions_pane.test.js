/** @jest-environment jsdom */
'use strict';

let L;
let map;
let control;
let tools;
let panel;

beforeAll(() => {
  document.body.innerHTML = '<div id="map"></div>';
  Object.defineProperties(document.getElementById('map'), {
    clientWidth: { value: 1040 }, clientHeight: { value: 760 }
  });
  window.SVGSVGElement.prototype.createSVGRect = () => ({});
  window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
  window.osrmConfig = {
    OSRM_VECTOR_STYLE: 'images/openstreetmap/style.json', OSRM_DEFAULT_LAYER: 'osm', OSRM_VECTOR_THEME: 'dark',
    OSRM_GEOCODERS: '[{"name":"Coordinates only","url":""}]', OSRM_LANGUAGE: 'en',
    OSRM_MODES: '[{"name":"Car","url":"https://routing.example.test","profile":"driving"}]'
  };
  L = require('leaflet');
  require('leaflet-routing-machine');
  const routing = L.Routing;
  // Exercise the real plan and pane without sending routing requests.
  jest.spyOn(routing.Control.prototype, 'route').mockImplementation(function() { return this; });
  const mapFactory = jest.spyOn(L, 'map');
  const controlFactory = jest.spyOn(routing, 'control');
  const toolsFactory = jest.spyOn(require('../src/tools'), 'control');
  require('../src/index');
  map = mapFactory.mock.results[0].value;
  control = controlFactory.mock.results[0].value;
  tools = toolsFactory.mock.results[0].value;
  panel = control.getContainer();
});

afterAll(() => {
  if (map) map.remove();
  jest.restoreAllMocks();
  delete window.osrmConfig;
  document.body.replaceChildren();
});

beforeEach(() => {
  control.show();
  control.setWaypoints([L.latLng(50.21, 8.57), L.latLng(50.22, 8.58)]);
});

function removeLocatedWaypoint() {
  const index = control.getWaypoints().findIndex(waypoint => waypoint.latLng);
  control.getPlan()._geocoderElems[index]._element.closeButton.click();
}

test.each([0, 1])('keeps the directions pane open when removing endpoint %i and the last remaining location', index => {
  control.fire('routingstart');
  tools.setRouteGeoJSON({ type: 'FeatureCollection', features: [] });
  control.getPlan()._geocoderElems[index]._element.closeButton.click();
  expect(control.getWaypoints().filter(waypoint => waypoint.latLng)).toHaveLength(1);
  expect(panel.classList.contains('leaflet-routing-container-hide')).toBe(false);
  expect(tools.routeGeoJSON).toBeNull();
  expect(tools._gpxButton.hasAttribute('disabled')).toBe(true);
  expect(panel.querySelector('.osrm-route-empty h2').textContent).toBe('Plan your route');
  removeLocatedWaypoint();
  expect(control.getWaypoints().filter(waypoint => waypoint.latLng)).toHaveLength(0);
  expect(panel.classList.contains('leaflet-routing-container-hide')).toBe(false);
});

test('keeps the directions pane open when removing an intermediate stop', () => {
  control.setWaypoints([L.latLng(50.21, 8.57), L.latLng(50.215, 8.575), L.latLng(50.22, 8.58)]);
  control.getPlan()._geocoderElems[1]._element.closeButton.click();
  expect(control.getWaypoints().filter(waypoint => waypoint.latLng)).toHaveLength(2);
  expect(panel.classList.contains('leaflet-routing-container-hide')).toBe(false);
});

test('closes only through the close button and keeps that choice while clearing waypoints', () => {
  const close = panel.querySelector('.leaflet-routing-collapse-btn');
  close.click();
  expect(panel.classList.contains('leaflet-routing-container-hide')).toBe(true);
  control.setWaypoints([null, null]);
  expect(panel.classList.contains('leaflet-routing-container-hide')).toBe(true);
  close.click();
  expect(panel.classList.contains('leaflet-routing-container-hide')).toBe(false);
});
