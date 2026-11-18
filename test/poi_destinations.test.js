'use strict';

const { createExpression, featureFilter, validateStyleMin } = require('@maplibre/maplibre-gl-style-spec');
const style = require('../images/openstreetmap/style.json');
const theme = require('../src/vector_theme');
const { imageDefinition } = require('../src/poi_icons');
const { registerVectorImages } = require('../src/vector_images');
const sprites = require('../images/openstreetmap/sprites.json');

function matches(layer, properties) {
  return featureFilter(layer.filter, 'layers[0].filter').filter({ zoom: 17 }, { type: 1, properties });
}

function evaluate(expression, properties, zoom = 17) {
  if (!Array.isArray(expression)) return expression;
  const parsed = createExpression(expression, 'layers[0].layout.icon-image');
  expect(parsed.result).toBe('success');
  return parsed.value.evaluate({ zoom }, { type: 1, properties });
}

test.each([
  ['amenity', 'fuel', 'poi-destination-fuel'],
  ['amenity', 'hospital', 'poi-destination-hospital'],
  ['amenity', 'clinic', 'poi-destination-medical'],
  ['amenity', 'pharmacy', 'poi-destination-medical'],
  ['tourism', 'hotel', 'poi-destination-lodging'],
  ['tourism', 'motel', 'poi-destination-lodging'],
  ['tourism', 'hostel', 'poi-destination-lodging'],
  ['tourism', 'guest_house', 'poi-destination-lodging'],
  ['tourism', 'bed_and_breakfast', 'poi-destination-lodging'],
  ['tourism', 'camp_site', 'poi-destination-camping'],
  ['tourism', 'caravan_site', 'poi-destination-camping']
])('labels %s=%s once with a resolvable icon', (field, kind, id) => {
  const properties = { [field]: kind, name: 'Destination' };
  const layers = style.layers.filter(layer => layer['source-layer'] === 'pois' && matches(layer, properties));
  expect(layers.map(layer => layer.id)).toEqual([id]);
  const layer = layers[0];
  expect(evaluate(layer.layout['text-field'], properties)).toBe('Destination');
  expect(evaluate(layer.layout['text-field'], { [field]: kind })).toBe('');
  const icon = evaluate(layer.layout['icon-image'], properties);
  expect(icon.startsWith('basics:') ? sprites[icon.slice(7)] : imageDefinition(icon)).toBeTruthy();
});

test('retains generic amenities while keeping destination detail at street zooms', () => {
  const generic = style.layers.find(layer => layer.id === 'poi-amenity');
  expect(matches(generic, { amenity: 'bench' })).toBe(true);
  expect(matches(generic, { amenity: 'cafe' })).toBe(true);
  const selected = style.layers.filter(layer => layer.id.startsWith('poi-destination-'));
  for (const layer of selected) {
    expect(matches(layer, { amenity: 'bench' })).toBe(false);
    expect(evaluate(layer.paint['text-opacity'], {}, layer.minzoom)).toBe(0);
    expect(evaluate(layer.paint['text-opacity'], {}, layer.minzoom + 0.4)).toBe(1);
    expect(layer.layout['text-allow-overlap']).not.toBe(true);
    expect(layer.layout['text-optional']).toBe(true);
  }
  expect(selected.find(layer => layer.id.endsWith('hospital')).minzoom)
    .toBeLessThan(selected.find(layer => layer.id.endsWith('lodging')).minzoom);
});

test.each(['camp_site', 'caravan_site'])('uses a green camping accent for %s without adding a second icon', tourism => {
  const layer = style.layers.find(candidate => candidate.id === 'poi-destination-camping');
  const generic = style.layers.find(candidate => candidate.id === 'poi-tourism');
  expect(matches(generic, { tourism })).toBe(false);
  expect(layer.minzoom).toBe(14);
  expect(layer.paint['text-color']).toBe('#4f7751');
  const dark = theme.transformStyle(null, style).layers.find(candidate => candidate.id === layer.id);
  expect(evaluate(dark.paint['text-color'], { tourism })).toBe('#a0c59b');
  expect(evaluate(dark.paint['icon-color'], { tourism })).toBe('#a0c59b');
  expect(evaluate(layer.layout['icon-image'], { tourism })).toBe(tourism === 'camp_site' ? 'osrm-poi-campsite' : 'osrm-poi-caravan');
});

test('shares one first-request resolver for road plates, exits, and local POI symbols', async () => {
  const images = new Map();
  let resolveMissingImage;
  const addImage = jest.fn((id, image, options) => images.set(id, { image, options }));
  registerVectorImages({
    setMissingStyleImageResolver: resolver => { resolveMissingImage = resolver; },
    hasImage: id => images.has(id), addImage
  });
  const ids = ['osrm-road-shield', 'osrm-exit-shield', 'osrm-poi-fuel', 'osrm-poi-lodging', 'osrm-poi-campsite', 'osrm-poi-caravan'];
  await Promise.all([...ids, ...ids, 'unrelated'].map(resolveMissingImage));
  expect([...images.keys()]).toEqual(ids);
  expect(addImage).toHaveBeenCalledTimes(ids.length);
  for (const id of ids.slice(2)) {
    expect(images.get(id).options.sdf).toBe(true);
    expect(images.get(id).image.data.length).toBe(32 * 32 * 4);
  }
  const alpha = (image, x, y) => image.data[(y * image.width + x) * 4 + 3];
  const fuel = images.get('osrm-poi-fuel').image;
  expect(alpha(fuel, 8, 20)).toBeGreaterThan(191);
  expect(alpha(fuel, 12, 11)).toBeLessThan(191);
  const lodging = images.get('osrm-poi-lodging').image;
  expect(alpha(lodging, 20, 17)).toBeGreaterThan(191);
  expect(alpha(lodging, 20, 6)).toBeLessThan(191);
  const tent = images.get('osrm-poi-campsite').image;
  expect(alpha(tent, 10, 23)).toBeGreaterThan(191);
  expect(alpha(tent, 16, 23)).toBeLessThan(191);
  const caravan = images.get('osrm-poi-caravan').image;
  expect(alpha(caravan, 11, 25)).toBeGreaterThan(191);
  expect(alpha(caravan, 11, 13)).toBeLessThan(191);
  expect(imageDefinition('unrelated')).toBeNull();
});

test('keeps readable category colors and the same sources and layout in both palettes', () => {
  const dark = theme.transformStyle(null, style);
  expect(validateStyleMin(style)).toEqual([]);
  expect(validateStyleMin(dark)).toEqual([]);
  expect(dark.sources).toEqual(style.sources);
  for (const layer of style.layers.filter(layer => layer.id.startsWith('poi-destination-'))) {
    const counterpart = dark.layers.find(candidate => candidate.id === layer.id);
    expect(counterpart.layout).toEqual(layer.layout);
    expect(counterpart.filter).toEqual(layer.filter);
    const properties = layer.id.endsWith('lodging') ? { tourism: 'hotel' } : { amenity: 'hospital' };
    const color = evaluate(counterpart.paint['text-color'], properties);
    expect(color).toBe(properties.tourism ? '#c3b5df' : '#e4a9b3');
    expect(evaluate(counterpart.paint['icon-color'], properties)).toBe(color);
  }
});
