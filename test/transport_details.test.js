'use strict';

const { createExpression, featureFilter, validateStyleMin } = require('@maplibre/maplibre-gl-style-spec');
const style = require('../images/openstreetmap/style.json');
const theme = require('../src/vector_theme');
const { imageDefinition } = require('../src/poi_icons');
const { registerVectorImages } = require('../src/vector_images');
const sprites = require('../images/openstreetmap/sprites.json');

function matches(layer, properties) {
  return featureFilter(layer.filter, 'layers[0].filter').filter({ zoom: 17 }, { type: layer.type === 'symbol' ? 1 : 2, properties });
}

test.each([
  ['bus_station', 'symbol-transit-bus-station'],
  ['ferry_terminal', 'symbol-transit-ferry-terminal'],
  ['helipad', 'symbol-transit-helipad'],
  ['aerialway_station', 'symbol-transit-aerialway-station']
])('renders %s once with its category symbol and an optional name', (kind, id) => {
  const layers = style.layers.filter(layer => layer['source-layer'] === 'public_transport' && matches(layer, { kind }));
  expect(layers.map(layer => layer.id)).toEqual([id]);
  const layer = layers[0];
  const expression = createExpression(layer.layout['text-field'], 'layers[0].layout.text-field');
  expect(expression.value.evaluate({ zoom: 17 }, { properties: { name: 'Terminal' } })).toBe('Terminal');
  expect(expression.value.evaluate({ zoom: 17 }, { properties: {} })).toBe('');
  const icon = layer.layout['icon-image'];
  expect(icon.startsWith('basics:') ? sprites[icon.slice(7)] : imageDefinition(icon)).toBeTruthy();
  expect(layer.layout['text-optional']).toBe(true);
  expect(layer.layout['text-allow-overlap']).not.toBe(true);
});

test.each([{}, { tunnel: true }, { bridge: true }, { service: 'siding' }, { tunnel: true, service: 'siding' }, { bridge: true, service: 'siding' }])('keeps rail casing, service and tunnel treatment for added rail kinds %j', properties => {
  const rendered = kind => style.layers.filter(layer => layer.type === 'line' && layer['source-layer'] === 'streets' && matches(layer, { ...properties, kind, rail: true })).map(layer => layer.id);
  expect(rendered('rail').length).toBeGreaterThan(0);
  expect(rendered('narrow_gauge').map(id => id.replace('narrowgauge', 'rail'))).toEqual(rendered('rail'));
  expect(rendered('subway').map(id => id.replace('subway', 'lightrail'))).toEqual(rendered('light_rail'));
});

test('draws actual aerialway geometries without treating roads as aerialways', () => {
  const layer = style.layers.find(layer => layer.id === 'transport-aerialway');
  for (const kind of ['cable_car', 'gondola', 'chair_lift', 'goods']) expect(matches(layer, { kind })).toBe(true);
  expect(matches(layer, { kind: 'residential' })).toBe(false);
  expect(layer['source-layer']).toBe('aerialways');
  expect(layer.minzoom).toBeLessThan(style.layers.find(layer => layer.id === 'symbol-transit-aerialway-station').minzoom);
});

test('resolves the new transport symbols with the existing first-request image resolver', async () => {
  const images = new Map();
  let resolve;
  registerVectorImages({
    setMissingStyleImageResolver: callback => { resolve = callback; },
    hasImage: id => images.has(id),
    addImage: (id, image, options) => images.set(id, { image, options })
  });
  const ids = ['osrm-poi-ferry', 'osrm-poi-helipad', 'osrm-poi-cable-car'];
  await Promise.all([...ids, ...ids].map(resolve));
  expect(images.size).toBe(3);
  for (const id of ids) expect(images.get(id).options.sdf).toBe(true);
  const inside = (id, x, y) => images.get(id).image.data[(y * 32 + x) * 4 + 3] >= 192;
  expect(inside(ids[0], 16, 21)).toBe(true); // hull
  expect(inside(ids[0], 16, 12)).toBe(false); // cabin window
  expect(inside(ids[1], 16, 16)).toBe(true); // H crossbar
  expect(inside(ids[1], 16, 11)).toBe(false); // space inside landing circle
  expect(inside(ids[2], 16, 9)).toBe(true); // hanger
  expect(inside(ids[2], 11, 17)).toBe(false); // cabin window
});

test('keeps transport legible in both palettes without adding another tile source', () => {
  const dark = theme.transformStyle(null, style);
  expect(validateStyleMin(style)).toEqual([]);
  expect(validateStyleMin(dark)).toEqual([]);
  expect(dark.sources).toEqual(style.sources);
  for (const layer of dark.layers.filter(layer => layer['source-layer'] === 'public_transport')) {
    expect(layer.paint['icon-color']).toBe(theme.palette.mutedText);
    expect(layer.layout).toEqual(style.layers.find(candidate => candidate.id === layer.id).layout);
  }
  expect(dark.layers.find(layer => layer.id === 'transport-aerialway').paint['line-color']).toBe('#8692ad');
  const station = style.layers.filter(layer => layer['source-layer'] === 'public_transport' && matches(layer, { kind: 'station' }));
  expect(station.map(layer => layer.id)).toEqual(['symbol-transit-station']);
});
