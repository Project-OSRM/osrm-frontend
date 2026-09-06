// Content hashes for the assets the browser caches for a year.
//
// nginx serves bundle.js and the gauche-rs module with `Cache-Control:
// immutable`, which promises the bytes behind a URL never change. That
// promise only holds if the name changes with the content, so the build
// derives each name from a hash of the file itself: new bytes, new URL, and
// a returning visitor fetches instead of serving a stale copy for a year.
//
// The wasm hash is needed before Vite runs, because the bundle has the
// module's URL compiled into it, so it is computed from the file in
// node_modules rather than from build output.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const WASM_SOURCE = path.join(ROOT, 'node_modules', 'gauche-rs', 'gauche_rs.wasm');

// Eight hex characters of SHA-256: short enough to stay readable in a
// directory listing, wide enough that a changed file always changes the name.
export function contentHash(contents) {
  return createHash('sha256').update(contents).digest('hex').slice(0, 8);
}

// 'bundle.js' -> 'bundle.<hash>.js', 'gauche_rs.wasm' -> 'gauche_rs.<hash>.wasm'
export function hashedName(name, hash) {
  var dot = name.indexOf('.');
  return name.slice(0, dot) + '.' + hash + name.slice(dot);
}

export function wasmFileName() {
  return hashedName('gauche_rs.wasm', contentHash(readFileSync(WASM_SOURCE)));
}
