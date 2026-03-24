'use strict';

const { applyReplacements } = require('../scripts/replace');

// Minimal snapshots of each config file's default content
const LEAFLET_DEFAULTS = `
  center: L.latLng(38.8995,-77.0269),
  zoom: 13,
  language: 'en',
  layer: streets
  path: 'https://router.project-osrm.org/route/v1'
  label: 'Car (fastest)'
`;

const DEBUG_DEFAULTS = `
  "center": [
        -122.44315266116867,
        37.78238285747459
  ],
  zoom: 13,
  center: [-77.0269,38.8995]
  "tiles" : ["https://router.project-osrm.org/tile/v1/car/tile({x},{y},{z}).mvt"],
`;

describe('applyReplacements — leaflet_options.js content', () => {
  test('replaces backend URL', () => {
    const result = applyReplacements(LEAFLET_DEFAULTS, {
      OSRM_BACKEND: 'https://my-osrm.example.com'
    });
    expect(result).toContain('https://my-osrm.example.com');
    expect(result).not.toContain('router.project-osrm.org');
  });

  test('replaces profile label', () => {
    const result = applyReplacements(LEAFLET_DEFAULTS, { OSRM_LABEL: 'Bicycle (fastest)' });
    expect(result).toContain('Bicycle (fastest)');
    expect(result).not.toContain('Car (fastest)');
  });

  test('replaces zoom level', () => {
    const result = applyReplacements(LEAFLET_DEFAULTS, { OSRM_ZOOM: 15 });
    expect(result).toContain('zoom: 15');
    expect(result).not.toContain('zoom: 13');
  });

  test('replaces language', () => {
    const result = applyReplacements(LEAFLET_DEFAULTS, { OSRM_LANGUAGE: 'de' });
    expect(result).toContain("language: 'de'");
    expect(result).not.toContain("language: 'en'");
  });

  test('replaces default layer', () => {
    const result = applyReplacements(LEAFLET_DEFAULTS, { OSRM_DEFAULT_LAYER: 'osm' });
    expect(result).toContain('layer: osm');
    expect(result).not.toContain('layer: streets');
  });

  test('replaces Leaflet LatLng center coordinates', () => {
    const result = applyReplacements(LEAFLET_DEFAULTS, { OSRM_CENTER: '51.5074, -0.1278' });
    expect(result).toContain('51.5074,-0.1278');
    expect(result).not.toContain('38.8995,-77.0269');
  });

  test('uses defaults when no env vars given', () => {
    const result = applyReplacements(LEAFLET_DEFAULTS, {});
    // Defaults leave the content unchanged
    expect(result).toContain('38.8995,-77.0269');
    expect(result).toContain('zoom: 13');
    expect(result).toContain("language: 'en'");
    expect(result).toContain('layer: streets');
    expect(result).toContain("Car (fastest)");
  });

  test('does not attempt to replace a mapbox token', () => {
    const contentWithPlaceholder = LEAFLET_DEFAULTS + "\nmapboxToken = 'old-token'";
    const result = applyReplacements(contentWithPlaceholder, { OSRM_MAPBOX_TOKEN: 'new-token' });
    // OSRM_MAPBOX_TOKEN is no longer supported — the token line must be untouched
    expect(result).toContain("mapboxToken = 'old-token'");
  });
});

describe('applyReplacements — debug/index.html content', () => {
  test('replaces OSRM backend tile URL', () => {
    const result = applyReplacements(DEBUG_DEFAULTS, {
      OSRM_BACKEND: 'http://localhost:5000'
    });
    expect(result).toContain('http://localhost:5000/tile/v1/car/tile');
    expect(result).not.toContain('router.project-osrm.org');
  });

  test('replaces GL-format initial center (LngLat)', () => {
    const result = applyReplacements(DEBUG_DEFAULTS, { OSRM_CENTER: '51.5074, -0.1278' });
    expect(result).not.toContain('-122.44315266116867');
    expect(result).toContain('-0.1278');
    expect(result).toContain('51.5074');
  });

  test('replaces GL Map constructor center (LngLat)', () => {
    const result = applyReplacements(DEBUG_DEFAULTS, { OSRM_CENTER: '51.5074, -0.1278' });
    expect(result).toContain('-0.1278,51.5074');
    expect(result).not.toContain('-77.0269,38.8995');
  });
});

describe('applyReplacements — edge cases', () => {
  test('returns content unchanged when it contains no known placeholders', () => {
    const unrelated = 'hello world';
    expect(applyReplacements(unrelated, {})).toBe('hello world');
  });

  test('handles http backend URLs as well as https', () => {
    const content = 'http://router.project-osrm.org/tile/v1';
    const result = applyReplacements(content, { OSRM_BACKEND: 'http://localhost:5000' });
    expect(result).toContain('http://localhost:5000/tile/v1');
  });
});
