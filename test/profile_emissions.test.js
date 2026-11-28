/** @jest-environment jsdom */
'use strict';

const L = require('leaflet');
require('leaflet-routing-machine');

test('uses the configured emissions capability on initial load, selection, and history restore', () => {
  document.body.innerHTML = '<div id="map"></div>';
  window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
  window.osrmConfig = {
    OSRM_VECTOR_STYLE: 'images/openstreetmap/style.json',
    OSRM_VECTOR_THEME: 'dark',
    OSRM_GEOCODERS: [{ url: '' }],
    OSRM_MODES: [
      { name: 'Car without comparisons', url: '/car', profile: 'petrol' },
      { name: 'Car with comparisons', url: '/car', profile: 'petrol', showEmissionsBadge: true }
    ]
  };
  window.history.replaceState({}, '', '/?profile=1');
  jest.spyOn(L.Routing.OSRMv1.prototype, '_convertRoute').mockImplementation(() => ({}));
  const mapFactory = jest.spyOn(L, 'map');
  const controlFactory = jest.spyOn(L.Routing, 'control');

  try {
    require('../src/index');
    const router = controlFactory.mock.results[0].value.getRouter();
    const select = document.querySelector('.osrm-profile-chooser');
    const responseRoute = { legs: [{ steps: [{ mode: 'driving', distance: 1000, duration: 72 }] }] };
    expect(select.value).toBe('1');
    expect(router._convertRoute(responseRoute).estimatedEmissionsGrams).toBeCloseTo(136.7);

    select.value = '0';
    select.dispatchEvent(new Event('change'));
    expect(router.options.profile).toBe('petrol');
    expect(router._convertRoute(responseRoute)).not.toHaveProperty('estimatedEmissionsGrams');

    window.history.replaceState({}, '', '/?profile=1');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(select.value).toBe('1');
    expect(router._convertRoute(responseRoute).estimatedEmissionsGrams).toBeCloseTo(136.7);
  } finally {
    mapFactory.mock.results[0]?.value?.remove();
    jest.restoreAllMocks();
    window.history.replaceState({}, '', '/');
    window.localStorage.clear();
    delete window.osrmConfig;
    document.body.replaceChildren();
  }
});
