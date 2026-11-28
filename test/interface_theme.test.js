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
let router;

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
  router = { options: { showEmissionsBadge: true } };
  control.getRouter = () => router;
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

test('returns to the planning prompt when waypoint removal makes the route incomplete', () => {
  control.fire('routingstart');
  expect(panel.querySelector('.osrm-route-empty h2').textContent).toBe('Finding route…');
  control.fire('waypointschanged', { waypoints: [{ latLng: L.latLng(50.2, 8.5) }, { latLng: null }] });
  expect(panel.querySelector('.osrm-route-empty h2').textContent).toBe('Plan your route');
  expect(panel.classList.contains('leaflet-routing-container-hide')).toBe(false);
});

test('translates the actual pane labels and supports right-to-left reading', () => {
  showRoutes();
  tools.fire('languagechanged', { language: 'de' });
  expect(panel.querySelector('h1').textContent).toBe('Wegbeschreibung');
  expect(panel.querySelector('.osrm-panel-resizer').getAttribute('aria-label')).toBe('Größe der Wegbeschreibung ändern');
  expect(panel.querySelector('.osrm-mode-caption').textContent).toBe('Verkehrsmittel');
  expect(panel.querySelector('.leaflet-routing-add-waypoint').textContent).toBe('Zwischenstopp hinzufügen');
  expect(panel.querySelector('.osrm-route-badge').textContent).toBe('Schnellste Route');
  expect(panel.querySelector('.osrm-turn-list summary').textContent).toBe('Abbiegehinweise');
  tools.fire('languagechanged', { language: 'fa' });
  expect(panel.dir).toBe('rtl');
  expect(panel.querySelector('h1').textContent).toBe('راهنمای مسیر');
  tools.fire('languagechanged', { language: 'en' });
  expect(panel.dir).toBe('ltr');
  expect(panel.querySelector('h1').textContent).toBe('Directions');
});

test('lets the pane scroll natively without bubbling wheel gestures to the map', () => {
  const outerWheel = jest.fn();
  document.body.addEventListener('wheel', outerWheel);
  const event = new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true });
  panel.dispatchEvent(event);
  expect(outerWheel).not.toHaveBeenCalled();
  expect(event.defaultPrevented).toBe(false);
  document.body.removeEventListener('wheel', outerWheel);
});

test('moves the map with the mobile grip while retaining the visible focus and zoom', async () => {
  const previousWidth = window.innerWidth;
  const previousHeight = window.innerHeight;
  Object.defineProperties(mapContainer, { clientWidth: { value: 390 }, clientHeight: { value: 844 } });
  map.invalidateSize({ pan: true });
  panel.getBoundingClientRect = () => ({ width: 390, height: parseFloat(panel.style.getPropertyValue('--osrm-sheet-height')) || 506 });
  const viewport = require('../src/mobile_viewport');
  try {
    window.innerWidth = 390;
    window.innerHeight = 844;
    window.dispatchEvent(new Event('resize'));
    await new Promise(resolve => setTimeout(resolve, 40));
    const focus = viewport.getCenter(map);
    const zoom = map.getZoom();
    panel.querySelector('.osrm-panel-resizer').dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }));
    await new Promise(resolve => setTimeout(resolve, 40));
    const point = map.latLngToContainerPoint(focus);
    expect(Math.abs(point.y - (844 - 169) / 2)).toBeLessThanOrEqual(1);
    expect(map.getZoom()).toBe(zoom);
  } finally {
    window.innerWidth = previousWidth;
    window.innerHeight = previousHeight;
    window.dispatchEvent(new Event('resize'));
  }
});


test('places the accessible OSRM logo above the localized Directions heading', () => {
  const brand = panel.querySelector('.osrm-panel-brand');
  const logo = brand.querySelector('img');
  expect(logo.getAttribute('src')).toBe('images/osrm_logo.svg');
  expect(logo.alt).toBe('OSRM');
  expect(logo.nextElementSibling).toBe(brand.querySelector('h1'));
  expect(logo.width).toBe(104);
});

test('shows multiple property badges, keeps them stable on refresh, and translates them', () => {
  showRoutes();
  control._routes[0].summary.totalDistance = 10000;
  control._routes[1].summary = { totalTime: 870, totalDistance: 8000 };
  theme.decorateRoutes();
  const badges = () => [...panel.querySelectorAll('.leaflet-routing-alt')[1].querySelectorAll('.osrm-route-badge')].map(badge => badge.textContent);
  expect(badges()).toEqual(['Shortest', 'Similar arrival time']);
  theme.decorateRoutes();
  expect(badges()).toEqual(['Shortest', 'Similar arrival time']);
  expect(panel.querySelectorAll('.osrm-route-badges')).toHaveLength(2);
  tools.fire('languagechanged', { language: 'de' });
  expect(badges()).toEqual(['Kürzeste Route', 'Ähnliche Ankunftszeit']);
});


test('displays the Fewer turns shield for a route with one fewer turn', () => {
  showRoutes();
  control._routes[0].instructions = [{ type: 'Head' }, { type: 'Left' }, { type: 'DestinationReached' }];
  control._routes[1].instructions = [{ type: 'Head' }, { type: 'Left' }, { type: 'Right' }, { type: 'DestinationReached' }];
  theme.decorateRoutes();
  const cards = panel.querySelectorAll('.leaflet-routing-alt');
  expect([...cards[0].querySelectorAll('.osrm-route-badge')].map(badge => badge.textContent)).toContain('Fewer turns');
  expect(cards[1].textContent).not.toContain('Fewer turns');
});

test('adds estimated CO₂ savings on the map and card of the lowest-emission alternative', () => {
  showRoutes();
  control._routes[0].estimatedEmissionsGrams = 1000;
  control._routes[1].estimatedEmissionsGrams = 750;
  theme.decorateRoutes();

  const mapBadges = () => mapContainer.querySelectorAll('.osrm-route-label .osrm-route-emissions-badge');
  expect(mapBadges()).toHaveLength(1);
  expect(mapBadges()[0].textContent).toBe('25% less CO₂');
  expect(mapBadges()[0].title).toBe('Estimated CO₂ emissions for a medium petrol car');
  expect(mapBadges()[0].closest('.osrm-route-label').textContent).toContain('16 min');
  const card = panel.querySelectorAll('.leaflet-routing-alt')[1];
  expect(card.querySelector('.osrm-route-emissions-badge').textContent).toBe('25% less CO₂');

  // Switching the selected route leaves the comparison against OSRM's first route.
  card.click();
  expect(mapBadges()[0].textContent).toBe('25% less CO₂');
  expect(mapBadges()[0].closest('.osrm-route-label').classList.contains('selected')).toBe(true);

  tools.fire('languagechanged', { language: 'de' });
  const germanPercent = new Intl.NumberFormat('de', { style: 'percent' }).format(0.25);
  expect(mapBadges()[0].textContent).toBe(germanPercent + ' weniger CO₂');
});

test('adds Less emissions without a percentage when the main route emits less', () => {
  showRoutes();
  control._routes[0].estimatedEmissionsGrams = 999;
  control._routes[1].estimatedEmissionsGrams = 1000;
  theme.decorateRoutes();
  const label = mapContainer.querySelector('.osrm-route-label.selected');
  expect(label.querySelector('.osrm-route-emissions-badge').textContent).toBe('Less emissions');
  expect(label.textContent).toContain('Fastest');
});

test('clears emissions badges immediately when routing starts with them disabled', () => {
  showRoutes();
  control._routes[0].estimatedEmissionsGrams = 750;
  control._routes[1].estimatedEmissionsGrams = 1000;
  theme.decorateRoutes();
  expect(document.querySelectorAll('.osrm-route-emissions-badge')).toHaveLength(2);

  router.options.showEmissionsBadge = false;
  control.fire('routingstart');

  expect(document.querySelector('.osrm-route-emissions-badge')).toBeNull();
  expect(mapContainer.querySelectorAll('.osrm-route-label')).toHaveLength(2);
  expect(panel.querySelector('.osrm-route-badge').textContent).toBe('Fastest');
});

test('does not display a rounded zero-percent saving', () => {
  showRoutes();
  control._routes[0].estimatedEmissionsGrams = 1000;
  control._routes[1].estimatedEmissionsGrams = 999;
  theme.decorateRoutes();
  expect(mapContainer.querySelector('.osrm-route-emissions-badge').textContent).toBe('<1% less CO₂');
});
