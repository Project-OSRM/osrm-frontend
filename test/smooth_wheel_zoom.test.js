/**
 * @jest-environment jsdom
 */
'use strict';

const L = require('leaflet');
const smoothWheelZoom = require('../src/smooth_wheel_zoom');
let map;
let container;
let handler;
let removed;

beforeEach(() => {
  removed = false;
  jest.useFakeTimers();
  jest.spyOn(L.Util, 'requestAnimFrame').mockImplementation((fn, context) => window.setTimeout(() => fn.call(context), 16));
  jest.spyOn(L.Util, 'cancelAnimFrame').mockImplementation(id => window.clearTimeout(id));
  jest.spyOn(window, 'scrollTo').mockImplementation(() => {});
  container = document.createElement('div');
  Object.defineProperties(container, { clientWidth: { value: 800 }, clientHeight: { value: 600 } });
  document.body.appendChild(container);
  map = L.map(container, { minZoom: 2, maxZoom: 18 }).setView([52.5, 13.4], 10);
  handler = smoothWheelZoom.enable(map);
});

afterEach(() => {
  if (!removed) map.remove();
  container.remove();
  jest.clearAllTimers();
  jest.restoreAllMocks();
  jest.useRealTimers();
});

function wheel(deltaY, options) {
  const event = new WheelEvent('wheel', { deltaY, clientX: 600, clientY: 200, bubbles: true, cancelable: true, ...options });
  container.dispatchEvent(event);
  return event;
}

function settle() { jest.advanceTimersByTime(1500); }

test('zooms through small fractional steps instead of jumping to a whole zoom level', () => {
  const zooms = [];
  map.on('zoom', () => zooms.push(map.getZoom()));
  expect(wheel(-6, { deltaMode: 1 }).defaultPrevented).toBe(true);
  expect(map.getZoom()).toBe(10);
  jest.advanceTimersByTime(80);
  expect(zooms.length).toBeGreaterThan(2);
  expect(map.getZoom()).toBeGreaterThan(10);
  expect(map.getZoom()).toBeLessThan(11);
  expect(Math.max(...zooms.map((zoom, index) => zoom - (index ? zooms[index - 1] : 10)))).toBeLessThan(0.25);
  settle();
  expect(map.getZoom()).toBeCloseTo(11, 4);
});

test('keeps the geographic point under the pointer fixed throughout the animation', () => {
  const point = L.point(600, 200);
  const anchor = map.containerPointToLatLng(point);
  wheel(-120);
  for (let i = 0; i < 20; i++) {
    jest.advanceTimersByTime(16);
    expect(map.latLngToContainerPoint(anchor).distanceTo(point)).toBeLessThanOrEqual(1);
  }
});

test('emits one gesture start and end, with no per-frame history or route completion events', () => {
  const starts = jest.fn();
  const ends = jest.fn();
  const moves = jest.fn();
  map.on('zoomstart', starts).on('zoomend', ends).on('moveend', moves);
  for (let i = 0; i < 12; i++) {
    wheel(-5);
    jest.advanceTimersByTime(16);
  }
  expect(starts).toHaveBeenCalledTimes(1);
  expect(ends).not.toHaveBeenCalled();
  expect(moves).not.toHaveBeenCalled();
  settle();
  expect(ends).toHaveBeenCalledTimes(1);
  expect(moves).toHaveBeenCalledTimes(1);
});

test('coalesces a burst of wheel events into one camera update per frame', () => {
  const zooms = jest.fn();
  map.on('zoom', zooms);
  for (let i = 0; i < 100; i++) wheel(-1);
  expect(zooms).not.toHaveBeenCalled();
  jest.advanceTimersByTime(20);
  expect(zooms).toHaveBeenCalledTimes(1);
});

test('reverses direction promptly and respects the map zoom limits', () => {
  wheel(-120);
  jest.advanceTimersByTime(80);
  const before = map.getZoom();
  wheel(240);
  jest.advanceTimersByTime(80);
  expect(map.getZoom()).toBeLessThan(before);
  settle();
  map.setZoom(18, { animate: false });
  const starts = jest.fn();
  map.on('zoomstart', starts);
  wheel(-120);
  settle();
  expect(map.getZoom()).toBe(18);
  expect(starts).not.toHaveBeenCalled();
  map.setZoom(2, { animate: false });
  wheel(120);
  settle();
  expect(map.getZoom()).toBe(2);
});

test('stops immediately when a drag or programmatic camera move starts', () => {
  wheel(-120);
  jest.advanceTimersByTime(80);
  container.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  const stopped = map.getZoom();
  settle();
  expect(map.getZoom()).toBe(stopped);
  wheel(-120);
  jest.advanceTimersByTime(30);
  map.setView([50, 10], 8, { animate: false });
  settle();
  expect(map.getZoom()).toBe(8);
  expect(map.getCenter().lat).toBeCloseTo(50);
});

test('leaves wheel events inside controls alone and restores native zoom when disabled', () => {
  const control = document.createElement('div');
  container.appendChild(control);
  L.DomEvent.disableScrollPropagation(control);
  control.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, bubbles: true, cancelable: true }));
  settle();
  expect(map.getZoom()).toBe(10);
  expect(map.scrollWheelZoom.enabled()).toBe(false);
  handler.disable();
  expect(map.scrollWheelZoom.enabled()).toBe(true);
  expect(map.options.zoomSnap).toBe(1);
});

test('supports trackpad pinch and cleans up a running gesture when the map is removed', () => {
  wheel(-4, { ctrlKey: true });
  jest.advanceTimersByTime(50);
  expect(map.getZoom()).toBeGreaterThan(10);
  map.remove();
  removed = true;
  expect(map.scrollWheelZoom.enabled()).toBe(false);
  expect(handler.enabled()).toBe(false);
  expect(() => settle()).not.toThrow();
});

test('keeps marker positions aligned throughout fractional zoom', () => {
  const position = L.latLng(52.51, 13.42);
  const marker = L.marker(position, { icon: L.divIcon({ html: '1' }) }).addTo(map);
  wheel(-120);
  for (let i = 0; i < 20; i++) {
    jest.advanceTimersByTime(16);
    const drawn = L.DomUtil.getPosition(marker.getElement());
    expect(drawn.distanceTo(map.latLngToLayerPoint(position))).toBeLessThanOrEqual(1);
  }
});

test('uses elapsed time so the same gesture has the same speed at different refresh rates', () => {
  const samples = [];
  for (const frameTime of [8, 16, 32]) {
    handler.disable();
    map.setView([52.5, 13.4], 10, { animate: false });
    handler.enable();
    L.Util.requestAnimFrame.mockImplementation((fn, context) => window.setTimeout(() => fn.call(context), frameTime));
    wheel(-6, { deltaMode: 1 });
    jest.advanceTimersByTime(128);
    samples.push(map.getZoom());
    settle();
  }
  expect(Math.max(...samples) - Math.min(...samples)).toBeLessThan(0.001);
});
