/** @jest-environment jsdom */
'use strict';

const L = require('leaflet');
require('leaflet-routing-machine');
const markerInsets = require('../src/waypoint_marker').mapMarkerInsets();

let map;
let control;

beforeAll(() => {
  document.body.innerHTML = '<div id="map"></div>';
  Object.defineProperties(document.getElementById('map'), {
    clientWidth: { value: 390 },
    clientHeight: { value: 760 }
  });
  window.SVGSVGElement.prototype.createSVGRect = () => ({});
  window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
  window.osrmConfig = {
    OSRM_VECTOR_STYLE: 'images/openstreetmap/style.json',
    OSRM_DEFAULT_LAYER: 'osm',
    OSRM_VECTOR_THEME: 'dark',
    OSRM_GEOCODERS: '[{"url":""}]',
    OSRM_MODES: '[{"name":"Car","url":"https://routing.example.test","profile":"driving"}]'
  };
  jest.spyOn(L.Routing.Control.prototype, 'route').mockImplementation(function() { return this; });
  jest.spyOn(L.Routing.Control.prototype, '_updateLines').mockImplementation(() => {});
  const mapFactory = jest.spyOn(L, 'map');
  const controlFactory = jest.spyOn(L.Routing, 'control');
  require('../src/index');
  map = mapFactory.mock.results[0].value;
  control = controlFactory.mock.results[0].value;
  jest.spyOn(control.getContainer(), 'getBoundingClientRect').mockReturnValue({ width: 390, height: 420 });
});

afterAll(() => {
  if (map) map.remove();
  jest.restoreAllMocks();
  delete window.osrmConfig;
  document.body.replaceChildren();
});

test('fits the full waypoint pins above the sheet, including a marker away from the route', () => {
  map.setView([50.21, 8.58], 17);
  const entrance = L.latLng(50.208, 8.58);
  const place = L.latLng(50.219, 8.56);
  const via = L.latLng(50.21, 8.59);
  const destination = L.latLng(50.202, 8.6);
  const start = L.Routing.waypoint(entrance);
  start._entranceMarkerLatLng = place;
  control.setWaypoints([start, L.Routing.waypoint(via), L.Routing.waypoint(destination)]);
  const route = {
    routesIndex: 0,
    properties: { isSimplified: false },
    coordinates: [entrance, via, destination]
  };
  control._routes = [route];
  const fitBounds = map.fitBounds.bind(map);
  jest.spyOn(map, 'fitBounds').mockImplementation((bounds, options) =>
    fitBounds(bounds, Object.assign({}, options, {animate: false}))
  );

  control.fire('routesfound', { routes: [route] });
  control.fire('routeselected', { route });

  expect(map.fitBounds.mock.calls[0][0].contains(place)).toBe(true);
  expect(map.getZoom()).toBeLessThanOrEqual(17);
  for (const position of [place, via, destination]) {
    const point = map.latLngToContainerPoint(position);
    expect(point.x - markerInsets.left).toBeGreaterThanOrEqual(19);
    expect(point.x + markerInsets.right).toBeLessThanOrEqual(371);
    expect(point.y - markerInsets.top).toBeGreaterThanOrEqual(19);
    expect(point.y + markerInsets.bottom).toBeLessThanOrEqual(321);
  }
});
