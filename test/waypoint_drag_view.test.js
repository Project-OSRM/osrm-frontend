/** @jest-environment jsdom */
'use strict';

const L = require('leaflet');
require('leaflet-routing-machine');

let map;
let control;
let plan;

beforeAll(() => {
  document.body.innerHTML = '<div id="map"></div>';
  Object.defineProperties(document.getElementById('map'), {
    clientWidth: { value: 1040 },
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
  plan = control.getPlan();
  jest.spyOn(control.getContainer(), 'getBoundingClientRect').mockReturnValue({ width: 360, height: 760 });
});

afterAll(() => {
  if (map) map.remove();
  jest.restoreAllMocks();
  delete window.osrmConfig;
  document.body.replaceChildren();
});

test('keeps the zoomed-in view after a drag even when the route extends under the pane', () => {
  map.setView([50.21, 8.58], 17);
  const center = map.getCenter();
  const route = {
    routesIndex: 0,
    properties: { isSimplified: false },
    coordinates: [map.containerPointToLatLng([100, 200]), map.containerPointToLatLng([800, 390])]
  };
  control.setWaypoints(route.coordinates);
  control._routes = [route];
  control._selectedRoute = route;
  const panTo = jest.spyOn(map, 'panTo');
  const fitBounds = jest.spyOn(map, 'fitBounds');

  plan.fire('waypointdragstart');
  control.fire('routesfound', { routes: [route] });
  control.fire('routeselected', { route });
  plan.fire('waypointdragend');
  control.fire('routesfound', { routes: [route] });
  control.fire('routeselected', { route });

  expect(panTo).not.toHaveBeenCalled();
  expect(fitBounds).not.toHaveBeenCalled();
  expect(map.getCenter()).toEqual(center);
  expect(map.getZoom()).toBe(17);

  // A later selection can still refit an obscured route.
  control.fire('routeselected', { route });
  expect(panTo.mock.calls.length + fitBounds.mock.calls.length).toBe(1);
});
