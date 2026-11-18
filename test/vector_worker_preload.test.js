/** @jest-environment jsdom */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

test('builds an index that preloads the same worker file the vector renderer uses', () => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'osrm-vector-build-'));
  const vite = path.join(path.dirname(require.resolve('vite/package.json')), 'bin', 'vite.js');
  try {
    execFileSync(process.execPath, [vite, 'build', '--config', 'vite.vector.config.mjs', '--outDir', output], {
      cwd: path.resolve(__dirname, '..')
    });
    const html = new DOMParser().parseFromString(fs.readFileSync(path.join(output, 'index.html'), 'utf8'), 'text/html');
    const preload = html.querySelector('head link[rel="preload"][as="script"]');
    const worker = preload.getAttribute('href');
    expect(worker).toMatch(/^assets\/maplibre-gl-worker-[\w-]+\.js$/);
    expect(preload.crossOrigin).toBe('anonymous');
    expect(fs.statSync(path.join(output, worker)).isFile()).toBe(true);
    expect(fs.readFileSync(path.join(output, 'vector.js'), 'utf8')).toContain(`"${worker}"`);
  } finally {
    fs.rmSync(output, { recursive: true, force: true });
  }
}, 30000);
