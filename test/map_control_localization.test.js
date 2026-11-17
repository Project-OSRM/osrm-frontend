/** @jest-environment jsdom */
'use strict';
const L = require('leaflet');
const update = require('../src/map_control_localization');

test('localizes map controls without changing layer identities or checked state', () => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const map = L.map(container).setView([50, 8], 13);
  const standard = L.layerGroup().addTo(map);
  const satellite = L.layerGroup();
  const layers = L.control.layers({ Standard: standard, Satellite: satellite }, { Hiking: L.layerGroup() }).addTo(map);
  const location = L.DomUtil.create('div', 'leaflet-control-locate', container);
  const locationButton = L.DomUtil.create('a', '', location);
  const locationControl = { options: { strings: { title: 'Show my location' } } };
  update(map, layers, locationControl, 'de');
  expect(container.querySelector('.leaflet-control-zoom-in').title).toBe('Vergrößern');
  expect(container.querySelector('.leaflet-control-layers-toggle').title).toBe('Kartenebenen');
  expect(locationButton.title).toBe('Meinen Standort anzeigen');
  expect(layers.getContainer().textContent).toContain('Satellit');
  expect(layers.getContainer().textContent).toContain('Wanderwege');
  expect(layers._layers.find(entry => entry.layer === satellite).name).toBe('Satellite');
  const selected = layers.getContainer().querySelector('input:checked');
  update(map, layers, locationControl, 'fr');
  expect(layers.getContainer().querySelector('input:checked')).toBe(selected);
  expect(locationButton.title).toBe('Afficher ma position');
  map.remove();
  container.remove();
});

test('shows the localized street-overlay checkbox only for its Satellite base layer', () => {
  const map = L.map(document.createElement('div')).setView([50, 8], 13);
  const standard = L.layerGroup().addTo(map);
  const satellite = L.layerGroup();
  const streets = L.layerGroup();
  streets.options.overlayBaseLayer = satellite;
  const layers = L.control.layers({ OpenStreetMap: standard, Satellite: satellite }, { 'Street overlay': streets }).addTo(map);
  const input = () => Array.from(layers.getContainer().querySelectorAll('input')).find(element => element.layerId === L.stamp(streets));
  update(map, layers, null, 'en');
  expect(input().closest('label').hidden).toBe(true);
  map.removeLayer(standard);
  satellite.addTo(map);
  update(map, layers, null, 'de');
  expect(input().closest('label').hidden).toBe(false);
  expect(input().closest('label').textContent).toContain('Straßen einblenden');
  streets.addTo(map);
  map.removeLayer(satellite);
  standard.addTo(map);
  update(map, layers, null, 'fr');
  expect(input().closest('label').hidden).toBe(true);
  expect(input().checked).toBe(true);
  expect(layers._layers.find(entry => entry.layer === streets).name).toBe('Street overlay');
  map.remove();
});
