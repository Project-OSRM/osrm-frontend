'use strict';
const fs = require('fs');
const vm = require('vm');
const { validateStyleMin } = require('@maplibre/maplibre-gl-style-spec');

test('debug map uses the OSM vector background while preserving OSRM debug overlays', () => {
  const html = fs.readFileSync(require('path').join(__dirname, '../debug/index.html'), 'utf8');
  const script = html.slice(html.indexOf('function numberFieldText'), html.indexOf('var map ='));
  const context = { URL, window: { location: { href: 'http://localhost/debug/' } } };
  vm.runInNewContext(script, context);
  const style = JSON.parse(JSON.stringify(context.simple));
  expect(style.sources.osm.type).toBe('vector');
  expect(style.sources.osm.url).toBe('https://vector.openstreetmap.org/shortbread_v1/tilejson.json');
  expect(style.sources.osrm.type).toBe('vector');
  expect(style.layers.find(layer => layer.id === 'osm-streets')['source-layer']).toBe('streets');
  expect(style.layers.some(layer => layer.type === 'raster')).toBe(false);
  expect(validateStyleMin(style)).toEqual([]);
});
