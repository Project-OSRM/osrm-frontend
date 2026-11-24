'use strict';

// The classic edition is built from a pinned commit plus deploy/classic-demo.patch,
// with some modules copied from this tree. The pinned commit is not available in
// every clone, so these checks read the build inputs rather than build classic.

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const buildScript = fs.readFileSync(path.join(root, 'scripts/build_demo_site.sh'), 'utf8');
const patch = fs.readFileSync(path.join(root, 'deploy/classic-demo.patch'), 'utf8');

// The lines a patch adds to one file.
function addedLines(file) {
  const sections = patch.split(/^--- a\//m).slice(1);
  const section = sections.find(text => text.startsWith(file + '\n'));
  if (!section) return [];
  return section.split('\n').filter(line => line.startsWith('+') && !line.startsWith('+++')).map(line => line.slice(1));
}

function adds(file, text) {
  return addedLines(file).some(line => line.includes(text));
}

test('the build copies approaches.js into the classic source', () => {
  const copyLine = buildScript.split('\n').find(line => line.startsWith('cp ') && line.includes('$classic_source/src/'));
  expect(copyLine).toContain('src/approaches.js');
});

test('classic links parse and write ap', () => {
  expect(adds('src/links.js', "require('./approaches')")).toBe(true);
  expect(adds('src/links.js', 'ap: approaches.formatApproaches(options.waypoints)')).toBe(true);
  expect(adds('src/links.js', 'approaches.applyApproaches(parsedValues.waypoints, q.ap)')).toBe(true);
});

test('classic routing requests send approaches', () => {
  expect(adds('src/router_patches.js', "'&approaches='")).toBe(true);
  expect(adds('src/router_patches.js', 'appendApproaches(router);')).toBe(true);
});

test('classic url state keeps approaches and writes the address bar through format()', () => {
  expect(adds('src/url_state.js', 'withApproach')).toBe(true);
  expect(adds('src/url_state.js', 'withOptions')).toBe(true);
  expect(adds('src/url_state.js', 'var newParms = format(options);')).toBe(true);
});

test('classic state puts plain approaches back on the waypoints', () => {
  expect(adds('src/state.js', 'approaches.setApproach(L.Routing.waypoint(L.latLng(wp.lat, wp.lng)), wp.approach)')).toBe(true);
  expect(adds('src/state.js', 'approaches.setApproach(L.Routing.waypoint(null), wp.approach)')).toBe(true);
});

test('classic gets no approach toggle', () => {
  expect(patch).not.toContain('approach_control');
});
