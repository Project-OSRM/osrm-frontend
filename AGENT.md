AGENT

Purpose

This project follows Conventional Commits for commit messages and PR titles. Use the Conventional Commits format (feat, fix, docs, style, refactor, perf, test, chore) so CI and release tooling can work correctly.

Testing and linting

- Running tests: npm run test  (Jest)
- Linting: npm run test:lint  (ESLint: eslint src/*.js i18n/*.js)

Lifecycle scripts included in osrm-frontend@0.4.0:
  test
    jest
  start
    npm run build && webpack serve --config webpack.config.js --mode development

Available via `npm run`:
  test:lint
    eslint src/*.js i18n/*.js
  replace
    node ./scripts/replace.js
  clean
    rm -f bundle.raw.js
  compile
    webpack --config webpack.config.js
  build
    npm run clean && npm run replace && npm run compile && cp node_modules/leaflet/dist/leaflet.css css/leaflet.css
  start-prod
    npm run build && webpack serve --config webpack.config.js --mode production
  prepub
    npm run build

Notes

- Use `npm run build` before serving in production or when updating bundle.js.
- Commit generated artifacts only when necessary; follow repository guidelines.
- User might be running a dev instance in background that automatically rebuilds.
