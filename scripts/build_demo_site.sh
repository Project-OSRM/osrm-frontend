#!/bin/sh
set -eu

# Build the same classic sources that were published before the vector rollout.
classic_ref=9713b5b318400c108e178f9eece0bf7e634bcddc
classic_source=$(mktemp -d)
trap 'rm -rf "$classic_source"' EXIT

git archive "$classic_ref" > "$classic_source/source.tar"
tar -xf "$classic_source/source.tar" -C "$classic_source"
git -C "$classic_source" apply "$PWD/deploy/classic-demo.patch"
cp src/map_edition.js src/route_preferences.js src/approaches.js "$classic_source/src/"

(
    cd "$classic_source"
    npm ci
    npm run build
)
node scripts/assemble_demo_site.js "$classic_source/dist"
