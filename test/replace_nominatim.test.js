'use strict';

const { applyReplacements } = require('../scripts/replace');

describe('applyReplacements — nominatim endpoint override', () => {
  test('replaces Nominatim endpoint when NOMINATIM_ENDPOINT env var is set', () => {
    const content = "nominatim: { path: 'https://nominatim.openstreetmap.org/' }";
    const result = applyReplacements(content, { NOMINATIM_ENDPOINT: 'https://example.com/nominatim/' });
    expect(result).toContain('https://example.com/nominatim/');
    expect(result).not.toContain('nominatim.openstreetmap.org');
  });

  test('leaves content unchanged when NOMINATIM_ENDPOINT not provided', () => {
    const content = "nominatim: { path: 'https://nominatim.openstreetmap.org/' }";
    const result = applyReplacements(content, {});
    expect(result).toContain('nominatim.openstreetmap.org');
  });
});
