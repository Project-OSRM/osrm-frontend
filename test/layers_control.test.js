/** @jest-environment jsdom */
'use strict';

const L = require('leaflet');
const createLayersControl = require('../src/layers_control');

let map;
let satellite;
let control;

beforeEach(() => {
  map = L.map(document.createElement('div')).setView([50, 8], 15);
  satellite = L.layerGroup().addTo(map);
  control = createLayersControl({ OpenStreetMap: L.layerGroup(), Satellite: satellite }, {}).addTo(map);
});

afterEach(() => map.remove());

function selectedLayer() {
  const input = control.getContainer().querySelector('input:checked');
  return control._layers.find(layer => L.stamp(layer.layer) === input.layerId).layer;
}

test('does not replace the toggle with a radio button during pointer entry', () => {
  control.getContainer().dispatchEvent(new MouseEvent('mouseenter'));
  expect(control.getContainer().classList.contains('leaflet-control-layers-expanded')).toBe(false);
  expect(selectedLayer()).toBe(satellite);
});

test('opens the menu on a click while retaining the selected basemap', () => {
  const changed = jest.fn();
  map.on('baselayerchange', changed);
  control.getContainer().querySelector('.leaflet-control-layers-toggle').click();
  expect(control.getContainer().classList.contains('leaflet-control-layers-expanded')).toBe(true);
  expect(selectedLayer()).toBe(satellite);
  expect(changed).not.toHaveBeenCalled();
});

test('keeps keyboard expansion without changing the selected basemap', () => {
  control.getContainer().querySelector('.leaflet-control-layers-toggle').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
  expect(control.getContainer().classList.contains('leaflet-control-layers-expanded')).toBe(true);
  expect(selectedLayer()).toBe(satellite);
});

test('keeps raster basemaps selectable at vector zoom while respecting overlay limits', () => {
  const vector = L.layerGroup();
  const raster = L.layerGroup();
  const overlay = L.layerGroup();
  raster.options.maxZoom = 18;
  overlay.options.maxZoom = 18;
  vector.addTo(map);
  const layerControl = createLayersControl({ Vector: vector, Raster: raster }, { Overlay: overlay }).addTo(map);

  map.setZoom(20);
  const [vectorInput, rasterInput, overlayInput] = layerControl.getContainer().querySelectorAll('input');
  expect(vectorInput.checked).toBe(true);
  expect(rasterInput.disabled).toBe(false);
  expect(overlayInput.disabled).toBe(true);

  rasterInput.click();
  expect(map.hasLayer(raster)).toBe(true);
  expect(map.hasLayer(vector)).toBe(false);
});
