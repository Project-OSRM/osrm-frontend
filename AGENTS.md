# AGENTS

## Purpose

OSRM Frontend is the browser-based routing interface served at https://map.project-osrm.org. Built on [Leaflet Routing Machine](https://github.com/perliedman/leaflet-routing-machine) with Leaflet for map rendering.

## Conventions

### Commits & PRs

- **Conventional Commits** for commit messages and PR titles. Format: `type(scope): description`. Allowed types: `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`, `revert`, `style`, `test`.
- **Never commit directly to `gh-pages` (the default branch).** All changes go through a pull request.
- **All CI checks must pass before creating a PR.** CI runs lint (`npm run test:lint`), build (`npm run build`), and tests (`npm test`) — run all three locally first.
- **Strip all AI/harness advertising from commits.** Drop any `Co-Authored-By`, `Generated with`, or similar trailers — no ads, no co-author lines, no attribution footers in commit messages.
- **Disclose AI assistance on the PR only.** Describe what the agent helped with in the PR body (not in commits).

### Review Comments

- **Respond to every review comment.** Explain how it was addressed, or politely push back with reasoning if you disagree. Always keep a friendly, respectful tone.

- All new functionality must have unit test coverage.

### Naming

- **Use descriptive, functional names for variables and functions.** Avoid cute, playful, or whimsical names (e.g. no `makeRoute`, `switchTo`, `handleIt`). Names should describe what the thing is or does, not how the author feels about it.

### Notes

- Commit generated artifacts (`bundle.js`, `bundle.js.map`, `dist/`) only when necessary.
- When adding routing backends, prefer `OSRM_MODES` env var over editing `src/leaflet_options.js`.
- The debug tile viewer at `/debug` has its own `index.html` — keep it in sync if tile sources change.
- The "Open in Debug Map" link is per routing mode (`debugUrl` in `OSRM_MODES`), applied via `toolsControl.setDebugUrl()` on every profile change.
