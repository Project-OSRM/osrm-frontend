'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assembleDemoSite = require('../scripts/assemble_demo_site');

test('serves classic at the root and vector at new/ with independent relative assets', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'osrm-demo-'));
  try {
    const classic = path.join(temporary, 'classic');
    const vector = path.join(temporary, 'vector');
    const output = path.join(temporary, 'dist-demo');
    for (const directory of [classic, vector]) {
      fs.mkdirSync(path.join(directory, 'css'), { recursive: true });
      fs.mkdirSync(path.join(directory, 'debug'));
      fs.writeFileSync(path.join(directory, 'index.html'), '<head><title>OSRM</title></head>');
      fs.writeFileSync(path.join(directory, 'bundle.js'), path.basename(directory));
      fs.writeFileSync(path.join(directory, 'debug/index.html'), path.basename(directory));
    }
    fs.writeFileSync(path.join(vector, 'css/edition-switch.css'), '.osrm-edition-switch {}');

    assembleDemoSite(classic, vector, output);

    const read = (file) => fs.readFileSync(path.join(output, file), 'utf8');
    expect(read('index.html')).toContain('content="new/" data-edition="new"');
    expect(read('new/index.html')).toContain('content="../" data-edition="classic"');
    expect(read('index.html')).toContain('href="css/edition-switch.css"');
    expect(read('new/index.html')).toContain('href="css/edition-switch.css"');
    expect(read('bundle.js')).toBe('classic');
    expect(read('new/bundle.js')).toBe('vector');
    expect(read('debug/index.html')).toBe('classic');
    expect(read('new/debug/index.html')).toBe('vector');
    expect(read('css/edition-switch.css')).toBe(read('new/css/edition-switch.css'));
    expect(new URL('new/', 'https://example.org/osrm/').pathname).toBe('/osrm/new/');
    expect(new URL('../', 'https://example.org/osrm/new/').pathname).toBe('/osrm/');
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
