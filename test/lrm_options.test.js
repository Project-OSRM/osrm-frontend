'use strict';

/**
 * The connector Leaflet Routing Machine draws between a waypoint and the point
 * the route actually reaches — the walk across a forecourt, or from a pin
 * dropped on a building set back from the road. Its default is a solid black
 * casing and a solid white core with thin dashes laid over them, which against
 * this app's heavy blue route reads as more route.
 */

jest.mock('leaflet', () => ({
  tileLayer: () => ({}),
  latLng: (lat, lng) => ({ lat, lng }),
  Control: { Geocoder: { nominatim: () => ({}) } },
  CRS: { EPSG3857: { scale: () => 1 } },
  extend: Object.assign
}));

const options = require('../src/lrm_options');

describe('missing-route connector styling', () => {
  const forRoute = options.lrm.lineOptions.missingRouteStyles;
  const forAlternative = options.lrm.altLineOptions.missingRouteStyles;

  test('the selected route and its alternatives both get one', () => {
    expect(Array.isArray(forRoute)).toBe(true);
    expect(Array.isArray(forAlternative)).toBe(true);
  });

  test('every layer of the connector is dashed, so none of it reads as solid', () => {
    [forRoute, forAlternative].forEach((styles) => {
      expect(styles.length).toBeGreaterThan(0);
      styles.forEach((style) => {
        expect(style.dashArray).toBeTruthy();
      });
    });
  });

  test('the halo is dashed on the same pattern as the line it sits under', () => {
    // Different patterns would make the halo read as a second, solid line.
    const patterns = forRoute.map((s) => s.dashArray);
    expect(new Set(patterns).size).toBe(1);
  });

  test('the halo is the wider of the two, so the line stays legible on any basemap', () => {
    const [halo, line] = forRoute;
    expect(halo.color).toBe('white');
    expect(halo.weight).toBeGreaterThan(line.weight);
  });

  test('the connector takes the colour of the route it belongs to', () => {
    // An alternative's gap must not be mistaken for the selected route's.
    const routeColour = options.lrm.lineOptions.styles[0].color;
    const altColour = options.lrm.altLineOptions.styles[0].color;
    expect(forRoute.some((s) => s.color === routeColour)).toBe(true);
    expect(forAlternative.some((s) => s.color === altColour)).toBe(true);
    expect(forRoute).not.toEqual(forAlternative);
  });

  test('the connector is thinner than the route, so it never competes with it', () => {
    const routeWeight = options.lrm.lineOptions.styles[0].weight;
    forRoute.forEach((style) => {
      expect(style.weight).toBeLessThan(routeWeight);
    });
  });
});
