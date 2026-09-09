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
    fs.readFileSync(entrypointPath, 'utf8').replaceAll('/usr/share/nginx/html', outputDir)
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
