/** @jest-environment jsdom */
'use strict';

// The approach toggle against the real Leaflet Routing Machine plan that
// src/index.js builds: changing an approach must not rebuild the geocoder
// inputs, so address text typed but not yet submitted stays.

let L;
let map;
let control;
let plan;

const approachControl = require('../src/approach_control');
const waypointMarker = require('../src/waypoint_marker');
const links = require('../src/links');
const qs = require('qs');

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
  // Exercise the real plan without sending routing requests.
  jest.spyOn(L.Routing.Control.prototype, 'route').mockImplementation(function() { return this; });
  const mapFactory = jest.spyOn(L, 'map');
  const controlFactory = jest.spyOn(L.Routing, 'control');
  require('../src/index');
  map = mapFactory.mock.results[0].value;
  control = controlFactory.mock.results[0].value;
  plan = control.getPlan();
});

afterAll(() => {
  if (map) map.remove();
  jest.restoreAllMocks();
  delete window.osrmConfig;
  document.body.replaceChildren();
});

beforeEach(() => {
  control.setWaypoints([L.latLng(50.21, 8.57), null, L.latLng(50.22, 8.58)]);
});

function inputOf(i) {
  return plan._geocoderElems[i]._element.input;
}

function toggleOf(i) {
  return plan._geocoderElems[i].getContainer().querySelector('.' + approachControl.TOGGLE_CLASS);
}

function press(target) {
  target.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
}

test('keeps typed text in the changed row and in the other rows', () => {
  inputOf(0).value = 'Alexanderplatz';
  inputOf(1).value = 'Potsdamer Pl';
  const rowsBefore = plan._geocoderElems.map(elem => elem.getContainer());

  press(toggleOf(1));

  expect(inputOf(0).value).toBe('Alexanderplatz');
  expect(inputOf(1).value).toBe('Potsdamer Pl');
  plan._geocoderElems.forEach((elem, i) => expect(elem.getContainer()).toBe(rowsBefore[i]));
  expect(plan.getWaypoints()[1].options.approach).toBe('curb');
  expect(toggleOf(1).getAttribute('data-approach')).toBe('curb');
});

test('announces the change, which re-routes and is written to the share link', () => {
  const changed = jest.fn();
  plan.on('waypointschanged', changed);
  const routeRequests = control.route.mock.calls.length;

  press(toggleOf(2));

  plan.off('waypointschanged', changed);
  expect(changed).toHaveBeenCalledTimes(1);
  expect(control.route.mock.calls.length).toBeGreaterThan(routeRequests);
  expect(qs.parse(links.format({ waypoints: plan.getWaypoints() })).ap).toBe(';;curb');
  expect(qs.parse(window.location.search.slice(1)).ap).toBe(';;curb');
});

test('redraws the map pin of the changed waypoint', () => {
  press(toggleOf(0));
  press(toggleOf(0));
  expect(plan._markers[0].options.icon.options.iconUrl)
    .toBe(waypointMarker.waypointIconOptions(0, 3, 'opposite').iconUrl);
});
