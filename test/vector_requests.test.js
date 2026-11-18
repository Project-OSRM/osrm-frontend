'use strict';

const { transformRequest } = require('../src/vector_requests');

test.each([
  'https://vector.openstreetmap.org/shortbread_v1/14/8587/5548.mvt',
  'https://vector.openstreetmap.org/shortbread_v1/tilejson.json'
])('preserves provider URLs and native HTTP caching and identification: %s', url => {
  const request = transformRequest(url, 'Tile');
  expect(request).toEqual({ url, cache: 'default', referrerPolicy: 'strict-origin-when-cross-origin' });
  expect(request.headers).toBeUndefined();
  expect(new URL(request.url).search).toBe('');
});

test.each(['https://custom.example/tiles/1.mvt?token=public', 'https://vector.openstreetmap.org.example/1.mvt', '/images/openstreetmap/style.json?v=release'])('preserves other providers and local asset requests: %s', url => {
  expect(transformRequest(url, 'Tile')).toEqual({ url });
});

test('keeps official tile templates free of application release versions and cache busters', () => {
  const style = require('../images/openstreetmap/style.json');
  const urls = Object.values(style.sources).flatMap(source => source.tiles || []);
  expect(urls).toEqual(['https://vector.openstreetmap.org/shortbread_v1/{z}/{x}/{y}.mvt']);
});
