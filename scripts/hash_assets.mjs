// Renames the built bundle and the gauche-rs module to content-hashed names
// and points index.html at the bundle. Runs after the static files have been
// copied into dist/, and is the last step of `npm run build`.
//
// The wasm needs no rewriting here: its name is compiled into the bundle by
// the Vite plugin, from the same hash this script computes.

import { readFileSync, writeFileSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { ROOT, WASM_SOURCE, contentHash, hashedName, wasmFileName } from './asset_hash.mjs';

var dist = path.join(ROOT, 'dist');

function fail(message) {
  console.error('hash_assets: ' + message);
  process.exit(1);
}

// The gauche-rs module, under the name the bundle was built to request.
var wasmName = wasmFileName();
copyFileSync(WASM_SOURCE, path.join(dist, wasmName));

// The bundle. Vite leaves a sourceMappingURL comment pointing at the old
// name; strip it before hashing so the hash covers the code alone and does
// not depend on the name being written back into the file.
var bundlePath = path.join(dist, 'bundle.js');
if (!existsSync(bundlePath)) fail('dist/bundle.js is missing — did vite build run?');

var code = readFileSync(bundlePath, 'utf8');
var body = code.replace(/\s*\/\/# sourceMappingURL=\S*\s*$/, '');
var jsName = hashedName('bundle.js', contentHash(body));
var mapName = jsName + '.map';

writeFileSync(path.join(dist, jsName), body + '\n//# sourceMappingURL=' + mapName + '\n');
rmSync(bundlePath);

var mapPath = path.join(dist, 'bundle.js.map');
if (existsSync(mapPath)) {
  var map = JSON.parse(readFileSync(mapPath, 'utf8'));
  map.file = jsName;
  writeFileSync(path.join(dist, mapName), JSON.stringify(map));
  rmSync(mapPath);
}

// index.html loads the bundle by name. The copy in dist/ is rewritten; the
// one in the repository keeps the unhashed name and stays the template.
var indexPath = path.join(dist, 'index.html');
if (!existsSync(indexPath)) fail('dist/index.html is missing — it is copied before this step runs');

var html = readFileSync(indexPath, 'utf8');
var reference = "script.src = 'bundle.js';";
if (html.indexOf(reference) === -1) {
  fail('index.html no longer loads the bundle with ' + reference + ', so it cannot be pointed at ' + jsName);
}
writeFileSync(indexPath, html.replace(reference, "script.src = '" + jsName + "';"));

// The repository root is also served directly by some deployments, and the
// index.html there is the committed template, still asking for 'bundle.js'.
// Keep that name working: the same code under the unhashed name, next to the
// module under the hashed name the bundle actually requests. Only dist/ gets
// the immutable caching, which is what the hashed names are for.
writeFileSync(path.join(ROOT, 'bundle.js'), body + '\n//# sourceMappingURL=bundle.js.map\n');
if (existsSync(path.join(dist, mapName))) {
  var rootMap = JSON.parse(readFileSync(path.join(dist, mapName), 'utf8'));
  rootMap.file = 'bundle.js';
  writeFileSync(path.join(ROOT, 'bundle.js.map'), JSON.stringify(rootMap));
}
copyFileSync(WASM_SOURCE, path.join(ROOT, wasmName));

console.log('hash_assets: dist/' + jsName + ', dist/' + mapName + ', ' + wasmName +
  ' (root: bundle.js, ' + wasmName + ')');
