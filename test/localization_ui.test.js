/** @jest-environment jsdom */
'use strict';
const localization = require('../src/localization');
const keys = ['Directions', 'Travel mode', 'Toggle directions', 'Add stop', 'Reverse stops', 'Fastest', 'Alternative', 'Turn-by-turn directions', 'Plan your route', 'Finding route…', 'Route unavailable', 'Try another waypoint or change your route options.', 'Choose a start and destination, or click the map to add stops.', 'Loading vector map…', 'Vector map could not load. Try again or choose another background.', 'Try again', 'Map tools', 'Select profile', 'Select units', 'Metric', 'Imperial', 'Route options', 'Exclude road classes', 'Road classes depend on the routing backend.', 'Allow U-turns at via points'];

test.each(Object.keys(localization.getLanguages()))('provides the pane and control translations for %s', language => {
  const strings = localization.get(language);
  keys.forEach(key => {
    expect(strings).toHaveProperty([key]);
    expect(typeof strings[key]).toBe('string');
    expect(strings[key].length).toBeGreaterThan(0);
  });
});

test('updates document language and reading direction in both directions', () => {
  localization.setDocumentLanguage('fa');
  expect(document.documentElement.lang).toBe('fa');
  expect(document.documentElement.dir).toBe('rtl');
  localization.setDocumentLanguage('de');
  expect(document.documentElement.lang).toBe('de');
  expect(document.documentElement.dir).toBe('ltr');
});
