/** @jest-environment jsdom */
'use strict';
const L = require('leaflet');
const { createLegend } = require('../src/access_legend');

test('shows a localized legend only when a supported vector background is active at close zooms', () => {
  const element = document.createElement('div');
  document.body.appendChild(element);
  const mode = document.createElement('span');
  element.appendChild(mode);
  const map = L.map(element, { zoomAnimation: false }).setView([50.2, 8.58], 17);
  const legend = createLegend(map, mode, 'en');
  expect(legend.container.hidden).toBe(true);
  let property = 'motorcar';
  const layer = new L.Layer();
  layer.onAdd = () => {};
  layer.onRemove = () => {};
  layer.getAccessProperty = () => property;
  layer.addTo(map);
  expect(legend.container.hidden).toBe(false);
  expect(legend.container.textContent).toContain('Not permitted');
  legend.updateLocalization('de');
  expect(legend.container.textContent).toContain('Nicht erlaubt');
  map.setZoom(15);
  expect(legend.container.hidden).toBe(true);
  map.setZoom(17);
  expect(legend.container.hidden).toBe(false);
  property = null;
  map.fire('accessstylechange');
  expect(legend.container.hidden).toBe(true);
  property = 'bicycle';
  map.fire('accessstylechange');
  expect(legend.container.hidden).toBe(false);
  map.removeLayer(layer);
  expect(legend.container.hidden).toBe(true);
  map.remove();
  expect(legend.container.isConnected).toBe(false);
  element.remove();
});

test('provides access legend translations in every supported language', () => {
  const localization = require('../src/localization');
  for (const language of Object.keys(localization.getLanguages())) {
    const strings = localization.get(language);
    expect(strings['Not permitted']).toBeTruthy();
    expect(strings['Limited access']).toBeTruthy();
  }
});
