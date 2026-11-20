'use strict';
const { tileTemplate, componentStyle } = require('../src/component_tiles');
const { validateStyleMin, featureFilter } = require('@maplibre/maplibre-gl-style-spec');

test.each([
  [{ path: 'https://router.example/prefix/route/v1', profile: 'bike' }, 'https://router.example/prefix/tile/v1/bike/tile({x},{y},{z}).mvt'],
  [{ path: '/proxy/routed-foot/route/v1/', profile: 'foot' }, 'https://demo.example/proxy/routed-foot/tile/v1/foot/tile({x},{y},{z}).mvt'],
  [{ path: '/custom/routing', profile: 'car', tileUrl: '/tiles/{profile}/{z}/{x}/{y}.mvt?key=public' }, 'https://demo.example/tiles/car/{z}/{x}/{y}.mvt?key=public']
])('resolves routing and explicit tile templates without losing proxy prefixes', (service, expected) => {
  expect(tileTemplate(service, 'https://demo.example/demo/')).toBe(expected);
});

test.each([
  { path: '/custom/routing' }, { path: '/route/v1?token=secret' },
  { path: '/route/v1', tileUrl: false }, { path: '/route/v1', tileUrl: 'javascript:bad' },
  { path: '/route/v1', tileUrl: '/tiles/{x}/{y}.mvt' }, { debugUrl: 'https://debug.example/' }, undefined
])('does not guess a tile endpoint for unsupported services', service => {
  expect(tileTemplate(service)).toBeNull();
});

test('renders only true OSRM component flags, with no opaque background or diagnostics', () => {
  const style = componentStyle('https://router.example/tile({x},{y},{z}).mvt');
  expect(validateStyleMin(style)).toEqual([]);
  expect(style.layers).toHaveLength(1);
  const layer = style.layers[0];
  expect(layer['source-layer']).toBe('speeds');
  const filter = featureFilter(layer.filter, 'layers[0].filter').filter;
  for (const [flag, expected] of [[true, true], [false, false], [undefined, false], ['true', false], [1, false]]) {
    expect(filter({ zoom: 14 }, { type: 2, properties: { is_small: flag } })).toBe(expected);
  }
  expect(style.sources.osrm.minzoom).toBe(12);
});
