'use strict';

const { createPropertyExpression, featureFilter, latest, validateStyleMin } = require('@maplibre/maplibre-gl-style-spec');
const style = require('../images/openstreetmap/style.json');
const { transformStyle } = require('../src/vector_theme');
const satellite = require('../src/vector_satellite');

const palettes = [
  ['OpenStreetMap', style],
  ['Dark Vector', transformStyle(null, style)],
  ['Satellite street overlay', satellite.transformStyle(style)]
];

test.each(palettes)('%s only labels house numbers from the address source layer', (_, palette) => {
  expect(validateStyleMin(palette)).toEqual([]);
  const houses = palette.layers.filter(layer => JSON.stringify(layer.layout?.['text-field'] ?? '').includes('housenumber'));
  expect(houses.map(layer => [layer.id, layer['source-layer']])).toEqual([
    ['label-address-housenumber', 'addresses']
  ]);
  const [address] = houses;
  expect(address.layout['text-field']).toBe('{housenumber}');
  expect(address.layout.visibility).not.toBe('none');
  const filter = featureFilter(address.filter, 'layers[0].filter');
  expect(filter.filter({ zoom: 18 }, { type: 1, properties: { housenumber: '2' } })).toBe(true);
  expect(filter.filter({ zoom: 18 }, { type: 1, properties: {} })).toBe(false);
});

test.each(palettes.slice(0, 2))('%s retains shop icons and destination names', (_, palette) => {
  const shop = palette.layers.find(layer => layer.id === 'poi-shop');
  const pharmacy = palette.layers.find(layer => layer.id === 'poi-destination-medical');
  expect(shop.layout['icon-image']).toBeDefined();
  expect(pharmacy.layout['icon-image']).toBeDefined();
  expect(pharmacy.layout['text-field']).toEqual(['coalesce', ['get', 'name'], '']);
});

function layoutAtZoom(layer, property, zoom) {
  const expression = createPropertyExpression(layer.layout[property], 'layers[0].layout.' + property, latest.layout_symbol[property]);
  expect(expression.result).toBe('success');
  return expression.value.evaluate({ zoom });
}

test.each(palettes)('%s gives close-up address labels more space and lower placement priority', (_, palette) => {
  const index = id => palette.layers.findIndex(layer => layer.id === id);
  const addressIndex = index('label-address-housenumber');
  const address = palette.layers[addressIndex];
  expect(address.minzoom).toBe(17);
  expect(layoutAtZoom(address, 'text-padding', 17)).toBeGreaterThan(2);
  expect(layoutAtZoom(address, 'text-padding', 19)).toBeGreaterThan(layoutAtZoom(address, 'text-padding', 17));
  expect(addressIndex).toBeLessThan(index('label-street-primary'));
  expect(addressIndex).toBeLessThan(index('poi-destination-medical'));
});

test.each(palettes.slice(0, 2))('%s thins generic POI icons at close zooms', (_, palette) => {
  const genericIcons = palette.layers.filter(layer =>
    layer['source-layer'] === 'pois' && layer.layout?.['icon-image'] && !layer.layout['text-field']
  );
  expect(genericIcons.some(layer => layer.id === 'poi-shop')).toBe(true);
  for (const layer of genericIcons) {
    expect(layoutAtZoom(layer, 'icon-padding', 16).values).toEqual([2, 2, 2, 2]);
    expect(layoutAtZoom(layer, 'icon-padding', 19).values[0]).toBeGreaterThan(layoutAtZoom(layer, 'icon-padding', 17).values[0]);
  }
});
