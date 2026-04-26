'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const entrypointPath = path.join(__dirname, '..', 'docker', 'entrypoint.sh');

function generateConfig(envOverrides) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'osrm-entrypoint-'));
  const outputDir = path.join(tempDir, 'usr', 'share', 'nginx', 'html');
  const tempEntrypointPath = path.join(tempDir, 'entrypoint.sh');

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(
    tempEntrypointPath,
    fs.readFileSync(entrypointPath, 'utf8').replaceAll('/usr/share/nginx/html', outputDir)
  );
  fs.chmodSync(tempEntrypointPath, 0o755);

  try {
    execFileSync(tempEntrypointPath, ['true'], {
      env: {
        ...process.env,
        ...envOverrides
      },
      stdio: 'pipe'
    });

    return JSON.parse(fs.readFileSync(path.join(outputDir, 'config.json'), 'utf8'));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

describe('docker entrypoint runtime config', () => {
  test('uses Docker localhost defaults when no routing env vars are provided', () => {
    const config = generateConfig({
      OSRM_BACKEND: 'http://localhost:5000',
      OSRM_ENVIRONMENT: 'docker'
    });

    expect(config.OSRM_ENVIRONMENT).toBe('docker');
    expect(config.OSRM_BACKEND).toBe('');
    expect(config.OSRM_MODES).toBe('');
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
