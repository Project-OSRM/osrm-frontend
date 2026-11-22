'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

test('builds a content-addressed worker that the vector renderer can load directly', () => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'osrm-vector-build-'));
  const vite = path.join(path.dirname(require.resolve('vite/package.json')), 'bin', 'vite.js');
  try {
    execFileSync(process.execPath, [vite, 'build', '--config', 'vite.vector.config.mjs', '--outDir', output], {
      cwd: path.resolve(__dirname, '..')
    });
    const files = fs.readdirSync(path.join(output, 'assets'));
    const worker = 'assets/' + files.find(file => /^maplibre-gl-worker-[\w-]+\.js$/.test(file));
    expect(fs.statSync(path.join(output, worker)).isFile()).toBe(true);
    expect(fs.readFileSync(path.join(output, 'vector.js'), 'utf8')).toContain(`"${worker}"`);
  } finally {
    fs.rmSync(output, { recursive: true, force: true });
  }
}, 30000);
