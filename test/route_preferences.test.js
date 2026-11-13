/**
 * @jest-environment jsdom
 */
'use strict';

const L = require('leaflet');
require('leaflet-routing-machine');
const preferences = require('../src/route_preferences');
const links = require('../src/links');
const urlState = require('../src/url_state');

const waypoints = [L.Routing.waypoint(L.latLng(52.5, 13.4)), L.Routing.waypoint(L.latLng(52.6, 13.5))];

test('normalizes whitespace and duplicate exclusions without assuming backend classes', () => {
  expect(preferences.normalize({ exclude: ' toll, motorway,toll, ,custom_class ' })).toEqual({
    exclude: 'toll,motorway,custom_class', allowUTurns: false
  });
  expect(preferences.normalize({ exclude: ['toll'], allowUTurns: 'true' })).toEqual({ exclude: '', allowUTurns: false });
});

test('sends preferences through the real router URL and removes cleared exclusions', () => {
  const open = jest.spyOn(XMLHttpRequest.prototype, 'open').mockImplementation(() => {});
  const send = jest.spyOn(XMLHttpRequest.prototype, 'send').mockImplementation(function() {
    this.onerror({ type: 'error' });
  });
  const router = new L.Routing.OSRMv1({ serviceUrl: 'https://routing.example/route/v1', requestParameters: { custom: 'retained' } });
  preferences.applyToRouter(router, { exclude: 'motorway,toll', allowUTurns: true });
  router.route(waypoints, () => {});
  let url = new URL(open.mock.calls[0][1]);
  expect(url.searchParams.get('exclude')).toBe('motorway,toll');
  expect(url.searchParams.get('continue_straight')).toBe('false');
  expect(url.searchParams.get('custom')).toBe('retained');
  preferences.applyToRouter(router, {});
  router.route(waypoints, () => {});
  url = new URL(open.mock.calls[1][1]);
  expect(url.searchParams.has('exclude')).toBe(false);
  expect(url.searchParams.get('continue_straight')).toBe('true');
  open.mockRestore();
  send.mockRestore();
});

test('round trips preferences in shared links and plain browser history state', () => {
  const encoded = links.format({ waypoints, exclude: 'motorway,toll', allowUTurns: true });
  expect(links.parse(encoded)).toMatchObject({ exclude: 'motorway,toll', allowUTurns: true });
  expect(urlState.parse(urlState.format(urlState.parse(encoded)))).toMatchObject({ exclude: 'motorway,toll', allowUTurns: true });
});

test('keeps default links unchanged and ignores malformed query values', () => {
  expect(links.format({ waypoints })).not.toMatch(/exclude=|u=/);
  expect(links.parse('exclude[]=toll&u[]=true')).not.toHaveProperty('exclude');
  expect(links.parse('u=false').allowUTurns).toBe(false);
  expect(links.parse('u=nonsense')).not.toHaveProperty('allowUTurns');
});

test('input and checkbox changes update preferences, and restored settings update the controls', () => {
  const onChange = jest.fn();
  const control = preferences.createControl({}, {}, onChange);
  const input = control.container.querySelector('input[type=text]');
  const checkbox = control.container.querySelector('input[type=checkbox]');
  input.value = ' toll, toll, ferry ';
  input.dispatchEvent(new Event('change'));
  expect(onChange).toHaveBeenLastCalledWith({ exclude: 'toll,ferry', allowUTurns: false });
  checkbox.checked = true;
  checkbox.dispatchEvent(new Event('change'));
  expect(onChange).toHaveBeenLastCalledWith({ exclude: 'toll,ferry', allowUTurns: true });
  control.set({});
  expect(input.value).toBe('');
  expect(checkbox.checked).toBe(false);
  expect(onChange).toHaveBeenCalledTimes(2);
  control.updateLocalization({ 'Route options': 'Routenoptionen', 'Allow U-turns at via points': 'Wenden erlauben' });
  expect(control.container.querySelector('summary').textContent).toBe('Routenoptionen');
  expect(checkbox.parentNode.textContent).toBe('Wenden erlauben');
});
