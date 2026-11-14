/**
 * @jest-environment jsdom
 */
'use strict';

const L = require('leaflet');
const interfaceTheme = require('../src/interface_theme');
const modeSelector = require('../src/mode_selector');
const routeSummary = require('../src/route_summary');
const localization = require('../src/localization');
let map;
let mapContainer;
let panel;
let control;
let tools;
let selector;
let theme;

beforeEach(() => {
  mapContainer = document.createElement('div');
  document.body.appendChild(mapContainer);
  map = L.map(mapContainer).setView([50.2, 8.58], 13);
  panel = document.createElement('div');
  panel.className = 'leaflet-routing-container dark';
  panel.innerHTML = '<span class="leaflet-routing-collapse-btn"></span><div class="leaflet-routing-geocoders"><button class="leaflet-routing-add-waypoint"></button><button class="leaflet-routing-reverse-waypoints"></button></div><div class="leaflet-routing-alternatives-container"></div>';
  document.body.appendChild(panel);
  panel.querySelector('.leaflet-routing-collapse-btn').addEventListener('click', () => panel.classList.toggle('leaflet-routing-container-hide'));
  selector = modeSelector.createModeSelector({}, [{ label: 'Car', profile: 'driving' }, { label: 'Bike', profile: 'bike' }]);
  panel.querySelector('.leaflet-routing-geocoders').appendChild(selector.container);
  control = new L.Evented();
  control.getContainer = () => panel;
  control._altContainer = panel.querySelector('.leaflet-routing-alternatives-container');
  control._routes = [];
  control._formatter = { formatTime: seconds => Math.round(seconds / 60) + ' min' };
  tools = new L.Evented();
  tools._shareContainer = document.createElement('div');
  tools._shareContainer.className = 'leaflet-osrm-tools-share';
  tools._shareButton = document.createElement('span');
  tools._shareContainer.appendChild(tools._shareButton);
  tools._container = document.createElement('div');
  tools._container.className = 'leaflet-osrm-tools-container';
  tools._container.appendChild(tools._shareContainer);
  mapContainer.appendChild(tools._container);
  tools.getContainer = () => tools._container;
  tools._toggleSharePopup = jest.fn();
  interfaceTheme.initialize(true);
  theme = interfaceTheme.attach({ map, control, tools, modeSelector: selector, language: 'en' });
});

afterEach(() => {
  map.remove();
  panel.remove();
  mapContainer.remove();
  interfaceTheme.initialize(false);
  document.documentElement.style.removeProperty('--osrm-panel-height');
  jest.restoreAllMocks();
});

function showRoutes() {
  control._routes = [
    { name: 'Main Street', summary: { totalTime: 840 }, coordinates: [L.latLng(50.2, 8.5), L.latLng(50.21, 8.6)] },
    { name: 'Forest Road', summary: { totalTime: 960 }, coordinates: [L.latLng(50.19, 8.55), L.latLng(50.2, 8.61)] }
  ];
  control._altContainer.replaceChildren();
  control._routes.forEach((route, index) => {
    const card = document.createElement('div');
    card.className = 'leaflet-routing-alt' + (index ? ' leaflet-routing-alt-minimized' : '');
    card.innerHTML = routeSummary({ time: control._formatter.formatTime(route.summary.totalTime), distance: '5 km', name: route.name }) + '<table><tbody><tr><td>Turn left</td></tr></tbody></table>';
    card.addEventListener('click', () => control.fire('routeselected', { route }));
    control._altContainer.appendChild(card);
  });
  theme.decorateRoutes();
}

test('creates a directions header while retaining the original native mode selector', () => {
  expect(document.documentElement.classList.contains('osrm-theme-dark')).toBe(true);
  expect(panel.querySelector('h1').textContent).toBe('Directions');
  expect(panel.querySelector('.osrm-mode-section select')).toBe(selector.select);
  expect(selector.select.hidden).toBe(false);
  expect(panel.querySelector('.leaflet-routing-add-waypoint').textContent).toBe('Add stop');
  expect(panel.querySelector('.osrm-route-empty h2').textContent).toBe('Plan your route');
});

test('keeps toolbar sharing and header collapsing available to the keyboard', () => {
  expect(panel.querySelector('.osrm-panel-toolbar .leaflet-osrm-tools-share')).toBe(tools._shareContainer);
  tools._shareButton.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  expect(tools._toggleSharePopup).toHaveBeenCalledTimes(1);
  const collapse = panel.querySelector('.leaflet-routing-collapse-btn');
  expect(collapse.getAttribute('aria-label')).toBe('Toggle directions');
  collapse.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
  expect(panel.classList.contains('leaflet-routing-container-hide')).toBe(true);
});

test('places the existing toolbar directly below the directions heading', () => {
  const footer = panel.querySelector('.osrm-panel-toolbar');
  expect(footer.lastElementChild).toBe(tools.getContainer());
  expect(panel.querySelector('.osrm-panel-header').nextElementSibling).toBe(footer);
  expect(footer.getAttribute('aria-label')).toBe('Map tools');
  expect(footer.querySelector('.leaflet-osrm-tools-share')).toBe(tools._shareContainer);
  expect(panel.querySelector('.osrm-panel-header .leaflet-osrm-tools-share')).toBeNull();
});

test('shows all route cards, identifies the fastest, and makes detailed directions expandable', () => {
  showRoutes();
  const cards = panel.querySelectorAll('.leaflet-routing-alt');
  expect(cards[0].querySelector('.osrm-route-badge').textContent).toBe('Fastest');
  expect(cards[1].querySelector('.osrm-route-badge').textContent).toBe('Alternative');
  expect(cards[0].querySelector('.osrm-turn-list').open).toBe(false);
  expect(cards[0].querySelector('.osrm-turn-list table').textContent).toBe('Turn left');
  theme.decorateRoutes();
  expect(panel.querySelectorAll('.osrm-turn-list')).toHaveLength(2);
  expect(panel.querySelectorAll('.osrm-route-badge')).toHaveLength(2);
});

test('route cards and map callouts select alternatives without starting a new route request', () => {
  showRoutes();
  const selected = jest.fn();
  control.on('routeselected', selected);
  const summaries = panel.querySelectorAll('.osrm-directions-summary');
  summaries[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  expect(selected.mock.calls[0][0].route).toBe(control._routes[1]);
  expect(theme.labels.getLayers()).toHaveLength(2);
  theme.labels.getLayers()[0].fire('click');
  expect(selected.mock.calls[1][0].route).toBe(control._routes[0]);
  expect(theme.labels.getLayers()[0].getElement().querySelector('.selected')).not.toBeNull();
});

test('updates labels on a language change and presents routing errors without raw backend details', () => {
  jest.spyOn(localization, 't').mockImplementation((language, key) => language + ':' + key);
  tools.fire('languagechanged', { language: 'de' });
  expect(panel.querySelector('h1').textContent).toBe('de:Directions');
  control.fire('routingerror', { error: { message: 'PRIVATE BACKEND DETAILS' } });
  expect(panel.querySelector('.osrm-route-empty').textContent).toContain('de:Route unavailable');
  expect(panel.textContent).not.toContain('PRIVATE BACKEND DETAILS');
});

test('does not create map labels for empty or invalid route geometry', () => {
  expect(interfaceTheme.routeLabelCoordinate([], 0.5)).toBeNull();
  expect(interfaceTheme.routeLabelCoordinate([null, { lat: NaN, lng: 1 }], 0.5)).toBeNull();
  expect(interfaceTheme.routeLabelCoordinate([{ lat: 1, lng: 2 }], 0.5)).toEqual({ lat: 1, lng: 2 });
});
