/** @jest-environment jsdom */
'use strict';

const L = require('leaflet');
L.Control.Locate = L.Control.Locate || {};
const locate = require('leaflet.locatecontrol').locate;
const locationAcquisition = require('../src/location_acquisition');

let map;
let control;
let geolocation;
let onLocationError;

beforeEach(() => {
  jest.useFakeTimers();
  geolocation = {
    watchPosition: jest.fn(() => 1),
    clearWatch: jest.fn()
  };
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: geolocation
  });
  const container = document.body.appendChild(document.createElement('div'));
  map = L.map(container).setView([50, 8], 15);
  onLocationError = jest.fn();
  control = locate({
    locateOptions: { timeout: locationAcquisition.timeout },
    onLocationError,
    drawCircle: false,
    drawMarker: false,
    showCompass: false,
    setView: false
  }).addTo(map);
  locationAcquisition.attach(map, control);
});

afterEach(() => {
  map.remove();
  document.body.replaceChildren();
  delete navigator.geolocation;
  jest.useRealTimers();
});

function button() {
  return control.getContainer().querySelector('a');
}

function isAcquiring() {
  return button().querySelector('.leaflet-control-locate-spinner') !== null;
}

test('shows the spinner when clicked and stops waiting after one minute', () => {
  button().click();
  expect(isAcquiring()).toBe(true);
  expect(geolocation.watchPosition.mock.calls[0][2].timeout).toBe(60000);
  jest.advanceTimersByTime(59999);
  expect(isAcquiring()).toBe(true);
  expect(onLocationError).not.toHaveBeenCalled();
  jest.advanceTimersByTime(1);
  expect(isAcquiring()).toBe(false);
  expect(geolocation.clearWatch).toHaveBeenCalledWith(1);
  expect(onLocationError).toHaveBeenCalledTimes(1);
  expect(onLocationError.mock.calls[0][0]).toMatchObject({code: 3});
});

test('restores the location icon on success and keeps the active watch', () => {
  button().click();
  const [found] = geolocation.watchPosition.mock.calls[0];
  found({coords: {latitude: 50, longitude: 8, accuracy: 12}});
  expect(isAcquiring()).toBe(false);
  jest.advanceTimersByTime(60000);
  expect(geolocation.clearWatch).not.toHaveBeenCalled();
  expect(onLocationError).not.toHaveBeenCalled();
});

test('cancels the deadline on permission denial', () => {
  button().click();
  const [, failed] = geolocation.watchPosition.mock.calls[0];
  failed({code: 1, message: 'Permission denied'});
  expect(isAcquiring()).toBe(false);
  jest.advanceTimersByTime(60000);
  expect(onLocationError).toHaveBeenCalledTimes(1);
  expect(onLocationError.mock.calls[0][0]).toMatchObject({code: 1});
});

test('clicking again cancels without timing out a later request early', () => {
  button().click();
  jest.advanceTimersByTime(30000);
  button().click();
  expect(isAcquiring()).toBe(false);
  button().click();
  jest.advanceTimersByTime(30000);
  expect(isAcquiring()).toBe(true);
  expect(onLocationError).not.toHaveBeenCalled();
  jest.advanceTimersByTime(30000);
  expect(isAcquiring()).toBe(false);
  expect(onLocationError).toHaveBeenCalledTimes(1);
});
