/** @jest-environment jsdom */
'use strict';
const L = require('leaflet');
const getAttribution = require('../src/vector_attribution');
const createRenderer = require('../src/vector_renderer');
const { createLayer } = require('../src/vector_layer');
const osm = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const carto = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/about-carto/">CARTO</a>';
const configuredCarto = osm + ' © <a href="https://carto.com/attribution">CARTO</a>';
function sourceMap(credits) {
  return {
    getStyle: () => ({ sources: Object.fromEntries(credits.map((credit, index) => [index, {}])) }),
    getSource: id => ({ attribution: credits[id] })
  };
}

test('uses provider credits once despite different URLs and copyright entities', () => {
  expect(getAttribution(sourceMap([carto, carto]), configuredCarto)).toBe(carto);
  expect(getAttribution(sourceMap([carto]), osm)).toBe(carto);
});

test('keeps additional provider credits and configured credits before source loading', () => {
  expect(getAttribution(undefined, configuredCarto)).toBe(configuredCarto);
  expect(getAttribution(sourceMap([osm]), 'Local provider')).toBe(osm + ', Local provider');
});

test('OpenStreetMap credits do not contain CARTO', () => {
  expect(getAttribution(sourceMap([osm]), osm)).toBe(osm);
});

test('Leaflet attribution tracks vector loading and removal without duplicate or stale credits', async () => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const map = L.map(container).setView([50, 8], 10);
  const events = new L.Evented();
  let credits = [];
  const Base = L.Layer.extend({
    options: {},
    getMaplibreMap: () => Object.assign(events, sourceMap(credits)),
    onAdd: function(leafletMap) {
      const initial = this.getAttribution();
      events.once('load', () => {
        leafletMap.attributionControl.removeAttribution(initial);
        leafletMap.attributionControl.addAttribution(this.getAttribution());
      });
    },
    onRemove: () => {}
  });
  const Renderer = createRenderer(Base);
  const layer = createLayer('/style.json', { attribution: configuredCarto }, () => Promise.resolve({ createLayer: () => new Renderer() }));
  layer.addTo(map);
  await Promise.resolve();
  expect(map.attributionControl.getContainer().textContent.match(/CARTO/g)).toHaveLength(1);
  credits = [carto];
  events.fire('load');
  let text = map.attributionControl.getContainer().textContent;
  expect(text.match(/CARTO/g)).toHaveLength(1);
  expect(text.match(/OpenStreetMap/g)).toHaveLength(1);
  map.removeLayer(layer);
  const next = L.tileLayer('https://tiles.example/{z}/{x}/{y}.png', { attribution: osm }).addTo(map);
  text = map.attributionControl.getContainer().textContent;
  expect(text).toContain('Leaflet');
  expect(text).toContain('OpenStreetMap');
  expect(text).not.toContain('CARTO');
  map.removeLayer(next);
  map.remove();
  container.remove();
});
