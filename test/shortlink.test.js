'use strict';

jest.mock('corslite', () => jest.fn());

const corslite = require('corslite');
const shortlink = require('../src/shortlink');

describe('shortlink.osmli', () => {
  beforeEach(() => {
    corslite.mockReset();
  });

  test('rewrites localhost URLs to the public frontend before shortening', () => {
    expect(shortlink.getShareableUrl('http://localhost:9000/?z=13')).toBe(
      'https://map.project-osrm.org/?z=13'
    );
  });

  test('keeps public URLs unchanged', () => {
    expect(shortlink.getShareableUrl('https://map.project-osrm.org/?z=13')).toBe(
      'https://map.project-osrm.org/?z=13'
    );
  });

  test('returns the ShortURL from osm.li', () => {
    const callback = jest.fn();

    corslite.mockImplementation((url, handler) => {
      handler(null, { responseText: '{"ShortURL":"https://osm.li/abcd"}' });
    });

    shortlink.osmli('https://example.com/route', callback);

    expect(corslite).toHaveBeenCalledWith(
      'https://osm.li/get?url=https%3A%2F%2Fexample.com%2Froute',
      expect.any(Function),
      true
    );
    expect(callback).toHaveBeenCalledWith('https://osm.li/abcd');
  });

  test('falls back to an empty string when the request fails', () => {
    const callback = jest.fn();

    corslite.mockImplementation((url, handler) => {
      handler(new Error('network'));
    });

    shortlink.osmli('https://example.com/route', callback);

    expect(callback).toHaveBeenCalledWith('');
  });

  test('shortens the public frontend URL when called from localhost', () => {
    const callback = jest.fn();

    corslite.mockImplementation((url, handler) => {
      handler(null, { responseText: '{"ShortURL":"https://osm.li/abcd"}' });
    });

    shortlink.osmli('http://localhost:9000/?z=13', callback);

    expect(corslite).toHaveBeenCalledWith(
      'https://osm.li/get?url=https%3A%2F%2Fmap.project-osrm.org%2F%3Fz%3D13',
      expect.any(Function),
      true
    );
  });
});
