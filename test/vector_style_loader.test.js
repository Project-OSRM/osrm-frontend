/**
 * @jest-environment jsdom
 * @jest-environment-options {"url":"https://demo.example/osrm-vector-demo/"}
 */
'use strict';

const fs = require('fs');
const { withBundledSprites } = require('../src/vector_requests');
let loader;
let originalFetch;
let originalRatio;
const styleUrl = 'https://demo.example/osrm-vector-demo/images/openstreetmap/style.json?v=release';
const tileUrl = 'https://vector.openstreetmap.org/shortbread_v1/{z}/{x}/{y}.mvt';
const style = { version: 8, sources: { osm: { type: 'vector', tiles: [tileUrl] } }, layers: [], sprite: [{ id: 'basics', url: './sprites' }] };
const html = new DOMParser().parseFromString(fs.readFileSync(require.resolve('../index.html'), 'utf8'), 'text/html');
const spriteMetadata = { example: { width: 16, height: 16 } };
const spriteImage = new ArrayBuffer(16);

function runSpriteBootstrap(ratio) {
  window.devicePixelRatio = ratio;
  const script = html.querySelector('head script');
  new Function('window', 'document', script.textContent)(window, document);
}

function spriteUrls(ratio) {
  const suffix = ratio > 1 ? '@2x' : '';
  return ['.json', '.png'].map(extension => new URL('sprites' + suffix + extension, styleUrl).href);
}

function successfulResponse(url) {
  return {
    ok: true,
    json: async () => url.includes('style.json') ? style : spriteMetadata,
    arrayBuffer: async () => spriteImage
  };
}

beforeEach(() => {
  jest.resetModules();
  loader = require('../src/vector_style_loader');
  originalFetch = window.fetch;
  originalRatio = window.devicePixelRatio;
  window.fetch = jest.fn(async url => successfulResponse(url));
});

afterEach(() => {
  window.fetch = originalFetch;
  window.devicePixelRatio = originalRatio;
  delete window.osrmBundledSprites;
});

test.each([1, 2])('downloads each %ix sprite once and supplies the exact response to MapLibre', async ratio => {
  const urls = spriteUrls(ratio);
  runSpriteBootstrap(ratio);
  expect(window.fetch.mock.calls.map(([url]) => url)).toEqual(ratio > 1 ? urls : []);
  const pending = loader.loadBundledStyle(styleUrl);
  expect(window.fetch).toHaveBeenCalledWith(styleUrl, { cache: 'default', referrerPolicy: 'strict-origin-when-cross-origin' });
  expect(loader.loadBundledStyle(styleUrl)).toBe(pending);
  const addProtocol = jest.fn();
  const transform = withBundledSprites(window.osrmBundledSprites, addProtocol);
  expect(addProtocol).toHaveBeenCalledWith('osrm-sprite', expect.any(Function));
  const serveSprite = addProtocol.mock.calls[0][1];
  const metadataRequest = await transform(urls[0], 'SpriteJSON');
  const imageRequest = await transform(urls[1], 'SpriteImage');
  expect(metadataRequest.url).toMatch(/^osrm-sprite:\/\//);
  expect(imageRequest.url).toMatch(/^osrm-sprite:\/\//);
  expect((await serveSprite(metadataRequest)).data).toBe(spriteMetadata);
  expect((await serveSprite(imageRequest)).data).toBe(spriteImage);
  expect(window.fetch.mock.calls.map(([url]) => url)).toEqual([...urls, styleUrl]);
  expect(transform(urls[0], 'Tile')).toEqual({ url: urls[0] });
  expect(transform(tileUrl, 'Tile')).toEqual({ url: tileUrl, cache: 'default', referrerPolicy: 'strict-origin-when-cross-origin' });
  const remoteSprite = 'https://example.com/sprites@2x.json';
  expect(transform(remoteSprite, 'SpriteJSON')).toEqual({ url: remoteSprite });
  const loaded = await pending;
  expect(loaded.sprite[0].url).toBe('https://demo.example/osrm-vector-demo/images/openstreetmap/sprites');
  expect(loaded.sources.osm.tiles).toEqual([tileUrl]);
  expect(style.sprite[0].url).toBe('./sprites');
});

test('falls back to a normal sprite request if an early download fails', async () => {
  window.fetch.mockResolvedValueOnce({ ok: false, status: 503 });
  runSpriteBootstrap(2);
  const [json, png] = spriteUrls(2);
  const transform = withBundledSprites(window.osrmBundledSprites, jest.fn());
  await expect(transform(json, 'SpriteJSON')).resolves.toEqual({ url: json });
  expect(window.osrmBundledSprites.requests.has(json)).toBe(false);
  expect(await transform(png, 'SpriteImage')).toMatchObject({ url: expect.stringMatching(/^osrm-sprite:\/\//) });
  expect(window.fetch.mock.calls.map(([url]) => url)).toEqual([json, png]);
});

test('starts Docker with raster defaults when runtime config is unavailable', async () => {
  const environment = html.querySelector('meta[name="osrm-environment"]').cloneNode();
  environment.content = 'docker';
  document.head.appendChild(environment);
  const warning = jest.spyOn(console, 'warn').mockImplementation();
  try {
    runSpriteBootstrap(2);
    expect(window.fetch).not.toHaveBeenCalled();
    window.fetch.mockResolvedValueOnce({ ok: false, status: 404 });
    const configScript = html.querySelector('body script').textContent;
    new Function('window', 'document', 'fetch', configScript)(window, document, window.fetch);
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(window.fetch.mock.calls).toEqual([['config.json']]);
    expect(window.osrmConfig).toMatchObject({
      OSRM_ENVIRONMENT: 'docker',
      OSRM_DEFAULT_LAYER: 'streets',
      OSRM_VECTOR_STYLE: undefined
    });
    expect(document.querySelector('script[src="bundle.js"]')).not.toBeNull();
  } finally {
    warning.mockRestore();
    delete window.osrmConfig;
    document.querySelector('script[src="bundle.js"]')?.remove();
    environment.remove();
  }
});

test('retries a failed style response', async () => {
  window.fetch.mockResolvedValueOnce({ ok: false, status: 503 });
  await expect(loader.loadBundledStyle(styleUrl)).rejects.toThrow('HTTP 503');
  await expect(loader.loadBundledStyle(styleUrl)).resolves.toHaveProperty('version', 8);
  expect(window.fetch).toHaveBeenCalledTimes(2);
});

test('retries network and JSON failures rather than keeping a rejected style cached', async () => {
  window.fetch.mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce({ ok: true, json: async () => { throw new Error('Invalid JSON'); } });
  await expect(loader.loadBundledStyle(styleUrl)).rejects.toThrow('Offline');
  await expect(loader.loadBundledStyle(styleUrl)).rejects.toThrow('Invalid JSON');
  await expect(loader.loadBundledStyle(styleUrl)).resolves.toHaveProperty('version', 8);
});

test('preconnects to the default origins without independent sprite or worker preloads', () => {
  const connections = [...html.querySelectorAll('head link[rel="preconnect"]')];
  expect(connections.map(link => link.href)).toEqual([
    'https://vector.openstreetmap.org/', 'https://router.project-osrm.org/'
  ]);
  expect(connections.every(link => link.crossOrigin === 'anonymous')).toBe(true);
  expect(html.querySelector('head link[rel="preload"][href*="sprite"], head link[rel="preload"][href*="worker"]')).toBeNull();
});

test.each(['../index.html', '../debug/index.html'])('keeps a valid cross-origin referrer policy in %s', path => {
  const html = new DOMParser().parseFromString(fs.readFileSync(require.resolve(path), 'utf8'), 'text/html');
  expect(html.querySelector('meta[name="referrer"]').content).toBe('strict-origin-when-cross-origin');
});
