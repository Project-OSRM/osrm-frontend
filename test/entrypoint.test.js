'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const entrypointPath = path.join(__dirname, '..', 'docker', 'entrypoint.sh');

function generateConfig(envOverrides, options) {
  options = options || {};
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'osrm-entrypoint-'));
  const outputDir = path.join(tempDir, 'usr', 'share', 'nginx', 'html');
  const tempEntrypointPath = path.join(tempDir, 'entrypoint.sh');

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(
    tempEntrypointPath,
    fs.readFileSync(entrypointPath, 'utf8')
      .replaceAll('/usr/share/nginx/html', outputDir)
      .replaceAll('/etc/nginx/osrm-proxy.conf', path.join(tempDir, 'osrm-proxy.conf'))
  );
  fs.chmodSync(tempEntrypointPath, 0o755);

  if (options.indexHtml) {
    fs.writeFileSync(path.join(outputDir, 'index.html'), options.indexHtml, 'utf8');
  }

  try {
    execFileSync(tempEntrypointPath, ['true'], {
      env: {
        ...process.env,
        ...envOverrides
      },
      stdio: 'pipe'
    });

    const config = JSON.parse(fs.readFileSync(path.join(outputDir, 'config.json'), 'utf8'));

    if (options.proxy) {
      return {
        config: config,
        proxy: fs.readFileSync(path.join(tempDir, 'osrm-proxy.conf'), 'utf8'),
        mode: fs.statSync(path.join(tempDir, 'osrm-proxy.conf')).mode & 0o777
      };
    }

    if (options.indexHtml) {
      let rewritten = null;
      try {
        rewritten = fs.readFileSync(path.join(outputDir, 'index.html'), 'utf8');
      } catch (e) {
        // ignore
      }
      return { config: config, indexHtml: rewritten };
    }

    return config;
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

describe('docker entrypoint runtime config', () => {
  test('passes the configured geocoders through to config.json', () => {
    const geocoders = JSON.stringify([
      { name: 'House Nominatim', url: 'https://nominatim.internal/' },
      { name: 'Coordinates only', url: '' }
    ]);
    const config = generateConfig({ OSRM_ENVIRONMENT: 'docker', OSRM_GEOCODERS: geocoders });
    expect(JSON.parse(config.OSRM_GEOCODERS)).toEqual(JSON.parse(geocoders));
  });

  test('emits an empty geocoder list when none is configured', () => {
    const config = generateConfig({ OSRM_ENVIRONMENT: 'docker' });
    expect(config.OSRM_GEOCODERS).toBe('');
  });

  test('passes a custom tile server through to config.json', () => {
    const config = generateConfig({
      OSRM_ENVIRONMENT: 'docker',
      OSRM_TILE_URL: 'http://localhost:8080/tile/{z}/{x}/{y}.png',
      OSRM_TILE_NAME: 'Local tiles',
      OSRM_TILE_ATTRIBUTION: '\u00a9 My Tile Provider'
    });
    expect(config.OSRM_TILE_URL).toBe('http://localhost:8080/tile/{z}/{x}/{y}.png');
    expect(config.OSRM_TILE_NAME).toBe('Local tiles');
    expect(config.OSRM_TILE_ATTRIBUTION).toBe('\u00a9 My Tile Provider');
  });

  test('emits empty tile settings when none are configured', () => {
    const config = generateConfig({ OSRM_ENVIRONMENT: 'docker' });
    expect(config.OSRM_TILE_URL).toBe('');
    expect(config.OSRM_TILE_NAME).toBe('');
    expect(config.OSRM_TILE_ATTRIBUTION).toBe('');
  });

  test('a custom tile server becomes the default layer when none was chosen', () => {
    // The image ships OSRM_DEFAULT_LAYER=streets, so that value reads as
    // "operator did not choose" the same way the default backend does.
    const config = generateConfig({
      OSRM_ENVIRONMENT: 'docker',
      OSRM_DEFAULT_LAYER: 'streets',
      OSRM_TILE_URL: 'http://localhost:8080/tile/{z}/{x}/{y}.png'
    });
    expect(config.OSRM_DEFAULT_LAYER).toBe('custom');
  });

  test('an explicitly chosen layer survives a custom tile server', () => {
    const config = generateConfig({
      OSRM_ENVIRONMENT: 'docker',
      OSRM_DEFAULT_LAYER: 'satellite',
      OSRM_TILE_URL: 'http://localhost:8080/tile/{z}/{x}/{y}.png'
    });
    expect(config.OSRM_DEFAULT_LAYER).toBe('satellite');
  });

  test('the default layer is untouched without a custom tile server', () => {
    const config = generateConfig({ OSRM_ENVIRONMENT: 'docker', OSRM_DEFAULT_LAYER: 'streets' });
    expect(config.OSRM_DEFAULT_LAYER).toBe('streets');
  });

  test('a tile URL with JSON-significant characters stays valid JSON', () => {
    const config = generateConfig({
      OSRM_ENVIRONMENT: 'docker',
      OSRM_TILE_URL: 'http://localhost:8080/"{z}"/{x}/{y}.png',
      OSRM_TILE_ATTRIBUTION: 'a "quoted" \\ credit'
    });
    expect(config.OSRM_TILE_URL).toBe('http://localhost:8080/"{z}"/{x}/{y}.png');
    expect(config.OSRM_TILE_ATTRIBUTION).toBe('a "quoted" \\ credit');
  });

  test('uses public profiles as Docker defaults when no routing env vars are provided', () => {
    const config = generateConfig({
      OSRM_BACKEND: 'http://localhost:5000',
      OSRM_ENVIRONMENT: 'docker'
    });

    expect(config.OSRM_ENVIRONMENT).toBe('docker');
    expect(config.OSRM_BACKEND).toBe('');
    const modes = JSON.parse(config.OSRM_MODES);
    expect(modes.length).toBe(3);
    expect(modes[0].url).toBe('https://router.project-osrm.org');
  });

  test('keeps legacy single-backend config when only OSRM_BACKEND is set', () => {
    const config = generateConfig({
      OSRM_BACKEND: 'http://legacy:5000',
      OSRM_ENVIRONMENT: 'docker'
    });

    expect(config.OSRM_BACKEND).toBe('http://legacy:5000');
    expect(config.OSRM_MODES).toBe('');
  });

  test('stores JSON modes config when only OSRM_MODES is set', () => {
    const modes = JSON.stringify([
      { name: 'car', url: 'http://car:5000' },
      { name: 'bike', url: 'http://bike:5000' }
    ]);
    const config = generateConfig({
      OSRM_BACKEND: 'http://localhost:5000',
      OSRM_ENVIRONMENT: 'docker',
      OSRM_MODES: modes
    });

    expect(config.OSRM_BACKEND).toBe('');
    expect(JSON.parse(config.OSRM_MODES)).toEqual(JSON.parse(modes));
  });

  test('stores both values when OSRM_MODES and deprecated OSRM_BACKEND are set', () => {
    const modes = JSON.stringify([
      { name: 'custom', url: 'http://custom:5000' }
    ]);
    const config = generateConfig({
      OSRM_BACKEND: 'http://legacy:5000',
      OSRM_ENVIRONMENT: 'docker',
      OSRM_MODES: modes
    });

    expect(config.OSRM_BACKEND).toBe('http://legacy:5000');
    expect(JSON.parse(config.OSRM_MODES)).toEqual(JSON.parse(modes));
  });
});

describe('authenticated backend proxy (issue #316)', () => {
  test('keeps credentials in a private nginx file and defaults to same-origin routing', () => {
    const result = generateConfig({
      OSRM_BACKEND: 'http://localhost:5000',
      OSRM_PROXY_URL: 'https://private.example/routing/',
      OSRM_PROXY_USERNAME: 'test-user',
      OSRM_PROXY_PASSWORD: 'test-password'
    }, { proxy: true });
    const encoded = Buffer.from('test-user:test-password').toString('base64');
    expect(result.proxy).toContain('proxy_pass https://private.example/routing/;');
    expect(result.proxy).toContain('proxy_set_header Authorization "Basic ' + encoded + '";');
    expect(result.proxy).toContain('proxy_ssl_verify on;');
    expect(result.proxy).toContain('proxy_set_header Host $proxy_host;');
    expect(result.proxy).toContain('location ^~ /osrm/');
    expect(result.mode).toBe(0o600);
    expect(JSON.stringify(result.config)).not.toMatch(/test-user|test-password|private\.example/);
    expect(JSON.stringify(result.config)).not.toContain(encoded);
    expect(JSON.parse(result.config.OSRM_MODES)).toEqual([{ name: 'driving', url: '/osrm', profile: 'driving' }]);
  });

  test('preserves explicitly configured modes and supports an unauthenticated proxy', () => {
    const modes = '[{"name":"car","url":"/osrm"},{"name":"bike","url":"https://bike.example"}]';
    const result = generateConfig({ OSRM_PROXY_URL: 'http://backend:5000', OSRM_MODES: modes }, { proxy: true });
    expect(result.config.OSRM_MODES).toBe(modes);
    expect(result.proxy).toContain('proxy_pass http://backend:5000/;');
    expect(result.proxy).toContain('proxy_set_header Authorization "";');
  });

  test.each([
    'https://user:password@backend.example',
    'https://backend.example/?token=secret',
    'http://backend.example;include /tmp/evil;',
    'http://backend.example/\nmalicious',
    'file:///etc/passwd'
  ])('rejects unsafe proxy URL %s', (url) => {
    expect(() => generateConfig({ OSRM_PROXY_URL: url })).toThrow();
  });

  test('rejects ambiguous Basic Auth credentials', () => {
    expect(() => generateConfig({ OSRM_PROXY_URL: 'http://backend:5000', OSRM_PROXY_USERNAME: 'user:name' })).toThrow();
    expect(() => generateConfig({ OSRM_PROXY_URL: 'http://backend:5000', OSRM_PROXY_PASSWORD: 'password' })).toThrow();
  });

  test('leaves no active proxy directives when disabled', () => {
    expect(generateConfig({ OSRM_PROXY_URL: '' }, { proxy: true }).proxy).toBe('');
  });
});

test('passes vector background settings through runtime configuration', () => {
  const config = generateConfig({
    OSRM_VECTOR_STYLE: 'https://tiles.example/style.json',
    OSRM_VECTOR_NAME: 'Local vector',
    OSRM_VECTOR_ATTRIBUTION: '© Local provider'
  });
  expect(config.OSRM_VECTOR_STYLE).toBe('https://tiles.example/style.json');
  expect(config.OSRM_VECTOR_NAME).toBe('Local vector');
  expect(config.OSRM_VECTOR_ATTRIBUTION).toBe('© Local provider');
  expect(config.OSRM_DEFAULT_LAYER).toBe('vector');
});

test('prefers a configured vector background over the raster fallback by default', () => {
  const settings = {
    OSRM_VECTOR_STYLE: '/styles/local.json',
    OSRM_TILE_URL: '/tiles/{z}/{x}/{y}.png'
  };
  expect(generateConfig(settings).OSRM_DEFAULT_LAYER).toBe('vector');
  expect(generateConfig({ ...settings, OSRM_DEFAULT_LAYER: 'custom' }).OSRM_DEFAULT_LAYER).toBe('custom');
});

test('configures the dark vector theme by default and permits original provider styling', () => {
  expect(generateConfig({ OSRM_VECTOR_STYLE: '/style.json' }).OSRM_VECTOR_THEME).toBe('dark');
  expect(generateConfig({ OSRM_VECTOR_STYLE: '/style.json', OSRM_VECTOR_THEME: 'original' }).OSRM_VECTOR_THEME).toBe('original');
});
