// The build timestamp baked into the bundle, chosen so that building the same
// source twice produces the same bytes.
//
// A wall-clock timestamp made every build unique, which defeats the whole point
// of the content-hashed filenames: the hash covers this value, so an unchanged
// checkout still produced a new bundle URL and every returning visitor
// re-downloaded it. The commit date is the same information — when this code
// was written — and is fixed by the commit the build came from.
//
// SOURCE_DATE_EPOCH is the reproducible-builds convention and wins when set, so
// a packager can pin the value without a git checkout.

import { execFileSync } from 'node:child_process';

export function buildTimestamp() {
  var epoch = process.env.SOURCE_DATE_EPOCH;
  if (epoch && /^\d+$/.test(epoch)) {
    return new Date(Number(epoch) * 1000).toISOString();
  }

  try {
    // %cI is the committer date, strict ISO 8601.
    var committed = execFileSync('git', ['log', '-1', '--format=%cI'], {
      cwd: new URL('..', import.meta.url),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    if (committed) return new Date(committed).toISOString();
  } catch (err) {
    // No git, no repository, or no commits yet: fall through.
  }

  // Last resort. The bundle is still correct, only no longer reproducible.
  return new Date().toISOString();
}
