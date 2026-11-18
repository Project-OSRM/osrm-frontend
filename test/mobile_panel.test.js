/** @jest-environment jsdom */
'use strict';

const mobilePanel = require('../src/mobile_panel');
let panel;
let resizer;
let handle;
let onResize;
let language;
let originalWidth;
let originalHeight;
let originalFrame;
let originalCancelFrame;

beforeEach(() => {
  jest.useFakeTimers();
  originalWidth = window.innerWidth;
  originalHeight = window.innerHeight;
  originalFrame = window.requestAnimationFrame;
  originalCancelFrame = window.cancelAnimationFrame;
  window.innerWidth = 390;
  window.innerHeight = 800;
  window.requestAnimationFrame = callback => window.setTimeout(callback, 16);
  window.cancelAnimationFrame = id => window.clearTimeout(id);
  panel = document.createElement('section');
  panel.className = 'leaflet-routing-container dark';
  panel.innerHTML = '<header>Directions<button>Close</button></header><input value="My destination"><div class="route">Existing route</div>';
  document.body.appendChild(panel);
  panel.getBoundingClientRect = () => ({ height: parseFloat(panel.style.getPropertyValue('--osrm-sheet-height')) || 480 });
  onResize = jest.fn();
  language = 'en';
  resizer = mobilePanel.attach(panel, { onResize, translate: key => language + ':' + key });
  handle = panel.querySelector('.osrm-panel-resizer');
  const captures = new Set();
  handle.setPointerCapture = jest.fn(id => captures.add(id));
  handle.hasPointerCapture = id => captures.has(id);
  handle.releasePointerCapture = jest.fn(id => captures.delete(id));
});

afterEach(() => {
  resizer.destroy();
  panel.remove();
  window.innerWidth = originalWidth;
  window.innerHeight = originalHeight;
  window.requestAnimationFrame = originalFrame;
  window.cancelAnimationFrame = originalCancelFrame;
  jest.useRealTimers();
});

function pointer(type, clientY, pointerId = 1, button = 0) {
  const event = new MouseEvent(type, { clientY, button, bubbles: true, cancelable: true });
  Object.defineProperties(event, { pointerId: { value: pointerId }, isPrimary: { value: true } });
  handle.dispatchEvent(event);
  return event;
}

function key(name) {
  const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true });
  handle.dispatchEvent(event);
  return event;
}

function height() {
  return parseFloat(panel.style.getPropertyValue('--osrm-sheet-height'));
}

test('adds a localized, focusable grip with the current pane height', () => {
  expect(panel.firstElementChild).toBe(handle);
  expect(handle.hidden).toBe(false);
  expect(handle.getAttribute('role')).toBe('separator');
  expect(handle.tabIndex).toBe(0);
  expect(handle.getAttribute('aria-orientation')).toBe('horizontal');
  expect(handle.getAttribute('aria-controls')).toBe(panel.id);
  expect(panel.id).not.toBe('');
  expect(handle.getAttribute('aria-valuemin')).toBe('20');
  expect(handle.getAttribute('aria-valuemax')).toBe('90');
  expect(handle.getAttribute('aria-valuenow')).toBe('60');
  expect(height()).toBe(480);
  language = 'de';
  resizer.updateLocalization();
  expect(handle.getAttribute('aria-label')).toBe('de:Resize directions pane');
});

test('lowers and raises the pane while preserving its open state, destination and route', () => {
  const destination = panel.querySelector('input');
  const route = panel.querySelector('.route');
  panel.scrollTop = 120;
  pointer('pointerdown', 300);
  pointer('pointermove', 600);
  jest.advanceTimersByTime(16);
  expect(height()).toBe(180);
  expect(panel.classList.contains('osrm-panel-dragging')).toBe(true);
  pointer('pointerup', 600);
  expect(height()).toBe(160);
  handle.click(); // A drag must not also act as a tap and advance to another size.
  expect(height()).toBe(160);
  jest.advanceTimersByTime(200);
  expect(panel.classList.contains('osrm-panel-resizing')).toBe(false);
  pointer('pointerdown', 650);
  pointer('pointermove', 80);
  pointer('pointerup', 80);
  expect(height()).toBe(720);
  expect(panel.classList.contains('leaflet-routing-container-hide')).toBe(false);
  expect(panel.querySelector('input')).toBe(destination);
  expect(destination.value).toBe('My destination');
  expect(panel.querySelector('.route')).toBe(route);
  expect(panel.scrollTop).toBe(120);
  expect(handle.setPointerCapture).toHaveBeenCalledWith(1);
  expect(handle.releasePointerCapture).toHaveBeenCalledWith(1);
});

test('clamps drags at compact and expanded heights instead of closing or leaving the screen', () => {
  pointer('pointerdown', 300);
  pointer('pointermove', 5000);
  jest.advanceTimersByTime(16);
  expect(height()).toBe(160);
  pointer('pointerup', 5000);
  pointer('pointerdown', 300);
  pointer('pointermove', -5000);
  jest.advanceTimersByTime(16);
  expect(height()).toBe(720);
  pointer('pointerup', -5000);
  expect(height()).toBe(720);
  expect(panel.classList.contains('leaflet-routing-container-hide')).toBe(false);
});

test('allows taps and keyboard arrows to choose the three pane sizes', () => {
  handle.click();
  expect(height()).toBe(720);
  handle.click();
  expect(height()).toBe(160);
  handle.click();
  expect(height()).toBe(480);
  expect(key('ArrowDown').defaultPrevented).toBe(true);
  expect(height()).toBe(160);
  key('ArrowUp');
  expect(height()).toBe(480);
  key('End');
  expect(height()).toBe(720);
  key('Home');
  expect(height()).toBe(160);
  key('Enter');
  expect(height()).toBe(720);
  key('Enter');
  expect(height()).toBe(160);
  key('Enter');
  expect(height()).toBe(720);
  key(' ');
  expect(height()).toBe(160);
  expect(key('Tab').defaultPrevented).toBe(false);
});

test('keeps ordinary pane scrolling separate and prevents grip gestures from reaching the map', () => {
  const outsidePointer = jest.fn();
  const outsideClick = jest.fn();
  document.body.addEventListener('pointerdown', outsidePointer);
  document.body.addEventListener('click', outsideClick);
  expect(pointer('pointerdown', 300).defaultPrevented).toBe(true);
  pointer('pointermove', 600);
  pointer('pointerup', 600);
  handle.click();
  expect(outsidePointer).not.toHaveBeenCalled();
  expect(outsideClick).not.toHaveBeenCalled();
  const wheel = new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true });
  panel.querySelector('.route').dispatchEvent(wheel);
  expect(wheel.defaultPrevented).toBe(false);
  document.body.removeEventListener('pointerdown', outsidePointer);
  document.body.removeEventListener('click', outsideClick);
});

test('ignores secondary pointers and restores the selected size when a gesture is cancelled', () => {
  pointer('pointerdown', 300, 1, 2);
  expect(handle.setPointerCapture).not.toHaveBeenCalled();
  pointer('pointerdown', 300);
  pointer('pointermove', 600, 2);
  jest.advanceTimersByTime(16);
  expect(height()).toBe(480);
  pointer('pointermove', 600);
  jest.advanceTimersByTime(16);
  expect(height()).toBe(180);
  pointer('pointercancel', 600);
  expect(height()).toBe(480);
  jest.advanceTimersByTime(200);
  expect(panel.classList.contains('osrm-panel-dragging')).toBe(false);
  expect(panel.classList.contains('osrm-panel-resizing')).toBe(false);
});

test('leaves desktop and short landscape layouts alone and restores the selected mobile size', () => {
  key('Home');
  window.innerWidth = 1100;
  window.dispatchEvent(new Event('resize'));
  expect(handle.hidden).toBe(true);
  expect(panel.style.getPropertyValue('--osrm-sheet-height')).toBe('');
  handle.click();
  expect(panel.style.getPropertyValue('--osrm-sheet-height')).toBe('');
  window.innerWidth = 800;
  window.innerHeight = 400;
  window.dispatchEvent(new Event('resize'));
  expect(handle.hidden).toBe(true);
  window.innerWidth = 390;
  window.innerHeight = 600;
  window.dispatchEvent(new Event('resize'));
  expect(handle.hidden).toBe(false);
  expect(height()).toBe(160);
  key('ArrowUp');
  expect(height()).toBe(360);
});

test('keeps the explicit close choice and releases events and animation callbacks on removal', () => {
  panel.classList.add('leaflet-routing-container-hide');
  pointer('pointerdown', 300);
  expect(handle.setPointerCapture).not.toHaveBeenCalled();
  expect(panel.classList.contains('leaflet-routing-container-hide')).toBe(true);
  panel.classList.remove('leaflet-routing-container-hide');
  pointer('pointerdown', 300);
  pointer('pointermove', 600);
  resizer.destroy();
  const calls = onResize.mock.calls.length;
  jest.runOnlyPendingTimers();
  window.dispatchEvent(new Event('resize'));
  handle.click();
  expect(onResize).toHaveBeenCalledTimes(calls);
  expect(panel.querySelector('.osrm-panel-resizer')).toBeNull();
  expect(panel.style.getPropertyValue('--osrm-sheet-height')).toBe('');
});
