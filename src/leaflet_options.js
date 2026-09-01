'use strict';

var L = require('leaflet');

// Load runtime configuration (from window.osrmConfig set by index.html)
// In Node/test environments, window won't exist, so use empty config
var config = (typeof window !== 'undefined' ? window.osrmConfig : null) || {};

/**
 * The CARTO Voyager raster tile URL, keyed when a key is configured.
 *
 * Unkeyed tiles still render, but CARTO stamps them with an "API KEY REQUIRED"
 * watermark, so a deployment without a key of its own is degraded rather than
 * broken. The key is necessarily public — it travels in every tile request the
 * browser makes — so it is deployment configuration rather than a secret, and
 * lives with the rest of it in `window.osrmConfig`.
 *
 * @returns {string} a Leaflet tile URL template
 */
function cartoVoyagerUrl() {
  var base = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
  var key = config.OSRM_CARTO_KEY;
  if (typeof key !== 'string' || !key.trim()) return base;
  return base + '?key=' + encodeURIComponent(key.trim());
}

var osmAttribution = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  cartoAttribution = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attribution">CARTO</a>',
  esriAttribution = 'Tiles © <a href="https://www.esri.com/">Esri</a> — Source: Esri, DigitalGlobe, GeoEye, Earthstar Geographics, CNES/Airbus DS, USDA, USGS, AeroGRID, IGN, and the GIS User Community',
  waymarkedtrailsAttribution = '© <a href="https://waymarkedtrails.org/">Sarah Hoffmann</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)';

var streets = L.tileLayer(cartoVoyagerUrl(), {
    attribution: cartoAttribution,
    subdomains: 'abcd',
    maxZoom: 19
  }),
  outdoors = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    attribution: osmAttribution + ', <a href="https://opentopomap.org/">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)',
    maxZoom: 17
  }),
  satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: esriAttribution,
    maxZoom: 19
  }),
  osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: osmAttribution
  }),
  osm_de = L.tileLayer('https://tile.openstreetmap.de/{z}/{x}/{y}.png', {
    attribution: osmAttribution
  }),
  hiking = L.tileLayer('https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png', {
    attribution: waymarkedtrailsAttribution
  }),
  bike = L.tileLayer('https://tile.waymarkedtrails.org/cycling/{z}/{x}/{y}.png', {
    attribution: waymarkedtrailsAttribution
  }),
  small_components = L.tileLayer('https://tools.geofabrik.de/osmi/tiles/routing/{z}/{x}/{y}.png', {});

/**
 * Parse center coordinates from the runtime config (`OSRM_CENTER` env var).
 *
 * Accepts a comma- or space-separated "lat,lng" string. Falls back to
 * Washington, DC (38.8995, -77.0269) when the value is missing, malformed,
 * or contains non-finite numbers.
 *
 * @returns {L.LatLng} The parsed or fallback center coordinate.
 */
function parseCenter() {
  var defaultCenterStr = '38.8995,-77.0269';
  var centerStr = config.OSRM_CENTER || defaultCenterStr;
  var parts = centerStr.split(/[, ]+/);
  var lat;
  var lng;

  if (parts.length < 2) {
    parts = defaultCenterStr.split(/[, ]+/);
  }

  lat = parseFloat(parts[0]);
  lng = parseFloat(parts[1]);

  if (!isFinite(lat) || !isFinite(lng)) {
    parts = defaultCenterStr.split(/[, ]+/);
    lat = parseFloat(parts[0]);
    lng = parseFloat(parts[1]);
  }

  return L.latLng(lat, lng);
}

/**
 * Get the routing service label from the runtime config (`OSRM_LABEL` env var).
 *
 * @returns {string} The label, defaulting to 'Car (fastest)'.
 */
function getLabel() {
  return config.OSRM_LABEL || 'Car (fastest)';
}

/**
 * Parse routing modes from the runtime config.
 *
 * **Precedence (highest to lowest):**
 * 1. `OSRM_MODES` — preferred JSON array of `{name, url, path?, profile?, debugUrl?}` objects.
 *    Also accepts a plain array of URL strings (auto-named "Mode 1", "Mode 2", …).
 *    When `profile` is not specified it defaults by position: index 0 → `'driving'`,
 *    index 1 → `'bike'`, index 2 → `'foot'`, index ≥ 3 → `'driving'`.
 * 2. `OSRM_BACKEND` — **deprecated** single-backend string. Emits a console warning.
 * 3. Environment defaults — three public profiles (driving, bike, foot) in dev mode;
 *    same three profiles in Docker mode when neither env var is set.
 *
 * If both `OSRM_MODES` and `OSRM_BACKEND` are set, `OSRM_MODES` wins and a
 * deprecation warning is emitted.
 *
 * @returns {Array<{name: string, url: string, path?: string, profile: string, debugUrl?: string}>}
 *   An array of mode objects, each with a display name, backend URL, optional
 *   explicit routing path, an internal routing profile (`driving`, `bike`, `foot`),
 *   and an optional debug map URL for the “Open in Debug Map” tool button.
 */
function parseModes() {
  // Read config fresh from window each time, not the captured config variable
  var currentConfig = (typeof window !== 'undefined' ? window.osrmConfig : null) || {};
  var modesValue = currentConfig.OSRM_MODES;
  var legacyBackend = currentConfig.OSRM_BACKEND;
  var modes;
  var hasModes;

  if (Array.isArray(modesValue)) {
    modes = modesValue;
    hasModes = modes.length > 0;
  } else if (typeof modesValue === 'string') {
    hasModes = modesValue.trim().length > 0;
  } else {
    hasModes = false;
  }
  
  // If both are configured, prefer OSRM_MODES and warn about the deprecated fallback.
  if (hasModes && legacyBackend) {
    console.warn('DEPRECATION WARNING: Both OSRM_MODES and OSRM_BACKEND are set. Using OSRM_MODES. Please migrate to OSRM_MODES only.');
  }
  
  // If OSRM_MODES is provided, parse it and use the configured modes.
  if (hasModes) {
    try {
      if (!Array.isArray(modes)) {
        modes = JSON.parse(modesValue);
      }

      // If modes is an array of strings and contains multiple entries, map them to Mode 1/2/..
      if (Array.isArray(modes) && modes.length > 1 && modes.every(function(m) {
        return typeof m === 'string'; 
      })) {
        var profileNames = ['driving', 'bike', 'foot'];
        return modes.map(function(url, index) {
          return {
            name: 'Mode ' + (index + 1),
            url: url,
            profile: profileNames[index] || 'driving'
          };
        });
      }

      // Special-case: accept a single-string array as the legacy single backend URL
      if (Array.isArray(modes) && modes.length === 1 && typeof modes[0] === 'string') {
        return [
          {
            name: 'default',
            url: modes[0],
            profile: 'driving'
          }
        ];
      }

      if (Array.isArray(modes) && modes.length > 0) {
        // Keep freely named user-facing modes while assigning known internal routing profiles.
        return modes.map(function(mode, index) {
          var profileNames = ['driving', 'bike', 'foot'];
          var result = {
            name: mode.name || ('Mode ' + (index + 1)),
            url: mode.url || 'http://localhost:5000',
            profile: mode.profile || profileNames[index] || 'driving'  // Honor explicit profile, fall back to positional
          };
          if (mode.path) result.path = mode.path;  // preserve explicit path (e.g. routed-bike/route/v1)
          if (mode.debugUrl) result.debugUrl = mode.debugUrl;  // preserve per-mode debug map link
          return result;
        });
      }
    } catch (e) {
      console.warn('Failed to parse OSRM_MODES JSON:', e);
    }
  }
  
  // Legacy support: OSRM_BACKEND alone configures one backend named "default".
  if (legacyBackend) {
    console.warn('DEPRECATION WARNING: OSRM_BACKEND is deprecated. Please use OSRM_MODES instead. Example: OSRM_MODES=\'[{"name":"default","url":"' + legacyBackend + '"}]\'');
    return [
      {
        name: 'default',
        url: legacyBackend,
        profile: 'driving'
      }
    ];
  }
  
  // If in dev mode (no OSRM_ENVIRONMENT or not 'docker'), use three public profiles
  if (currentConfig.OSRM_ENVIRONMENT !== 'docker') {
    return [
      { name: 'driving', url: 'https://router.project-osrm.org', path: 'https://router.project-osrm.org/route/v1', profile: 'driving' },
      { name: 'bike', url: 'https://routing.openstreetmap.de', path: 'https://routing.openstreetmap.de/routed-bike/route/v1', profile: 'bike' },
      { name: 'foot', url: 'https://routing.openstreetmap.de', path: 'https://routing.openstreetmap.de/routed-foot/route/v1', profile: 'foot' }
    ];
  }
  
  // Docker mode default: same three public profiles as non-Docker mode.
  // Override via OSRM_MODES or OSRM_BACKEND env vars to point at a self-hosted server.
  return [
    { name: 'driving', url: 'https://router.project-osrm.org', path: 'https://router.project-osrm.org/route/v1', profile: 'driving' },
    { name: 'bike', url: 'https://routing.openstreetmap.de', path: 'https://routing.openstreetmap.de/routed-bike/route/v1', profile: 'bike' },
    { name: 'foot', url: 'https://routing.openstreetmap.de', path: 'https://routing.openstreetmap.de/routed-foot/route/v1', profile: 'foot' }
  ];
}

/**
 * Get the backend URL for a specific routing profile.
 *
 * In Docker mode (`OSRM_ENVIRONMENT=docker`): uses `OSRM_BACKEND_<PROFILE>` or
 * falls back to `OSRM_BACKEND`, then to `http://localhost:5000`.
 *
 * In dev mode: uses the explicit override if set, otherwise returns the
 * well-known public OSRM service for the given profile.
 *
 * @param {string} profile — The routing profile name (e.g. 'driving', 'bike', 'foot').
 * @returns {string} The backend base URL for the profile.
 */
function getBackendForProfile(profile) {
  var profileBackend = config['OSRM_BACKEND_' + profile.toUpperCase()];
  var backend = profileBackend || config.OSRM_BACKEND;

  if (config.OSRM_ENVIRONMENT === 'docker') {
    return backend || 'http://localhost:5000';
  }

  // Local dev mode: use public OSRM services based on profile
  if (backend) {
    return backend;  // Explicit override
  }
  if (profile === 'driving') {
    return 'https://router.project-osrm.org';
  }
  // Bike and foot use routing.openstreetmap.de in dev mode
  return 'https://routing.openstreetmap.de';
}

/**
 * Legacy: get the backend URL for the default 'driving' profile.
 *
 * @deprecated Use `getBackendForProfile('driving')` instead.
 * @returns {string} The driving backend URL.
 */
function getBackend() {
  return getBackendForProfile('driving');
}

/**
 * Legacy: get the backend URL for bike/foot profiles.
 *
 * In Docker mode: delegates to `getBackendForProfile('bike')`.
 * In dev mode: returns `undefined` (caller uses known public services).
 *
 * @deprecated Use `getBackendForProfile(profile)` instead.
 * @returns {string|undefined} The alternative backend URL, or undefined in dev mode.
 */
function getAlternativeBackend() {
  // In Docker: use bike backend
  if (config.OSRM_ENVIRONMENT === 'docker') {
    return getBackendForProfile('bike') || getBackend();
  }
  // Local dev mode: use public routing services
  return undefined;
}

/**
 * Get the initial zoom level from the runtime config (`OSRM_ZOOM` env var).
 *
 * Accepts numeric strings. Falls back to 13 when missing or non-numeric.
 *
 * @returns {number} The zoom level (default 13).
 */
function getZoom() {
  var zoomValue = config.OSRM_ZOOM;
  var parsedZoom;

  if (zoomValue === undefined || zoomValue === null) {
    return 13;
  }

  parsedZoom = parseInt(zoomValue, 10);

  if (isNaN(parsedZoom)) {
    return 13;
  }

  return parsedZoom;
}

/**
 * Detect the UI language with the following precedence:
 *
 * 1. `OSRM_LANGUAGE` runtime config (env var) — explicit override.
 * 2. Browser `navigator.languages` / `navigator.language` — best match against
 *    the app's available translations (exact match → case-insensitive match →
 *    primary subtag fallback, e.g. `en-US` → `en`).
 * 3. `'en'` — English fallback.
 *
 * Note: URL param `hl` is handled separately in `index.js` and merged into
 * `defaultState` after module load, so it takes highest effective precedence.
 *
 * @returns {string} A supported language code (e.g. 'en', 'de', 'fr', 'pt-BR').
 */
function getLanguage() {
  try {
    // Read runtime config each time (honor OSRM_LANGUAGE when set at runtime)
    var currentConfig = (typeof window !== 'undefined' ? window.osrmConfig : null) || {};
    var localization = require('./localization');
    var languages = localization.getLanguages();

    function resolveCandidate(candidate) {
      if (!candidate) return undefined;
      candidate = String(candidate).trim();
      // exact match (case-sensitive)
      if (localization.get(candidate)) return candidate;

      // case-insensitive exact match against available keys (e.g., pt-br -> pt-BR)
      var lower = candidate.toLowerCase();
      var keys = Object.keys(languages);
      for (var k = 0; k < keys.length; k++) {
        if (keys[k].toLowerCase() === lower) return keys[k];
      }

      // primary subtag fallback (e.g., en-US -> en)
      var primary = candidate.split(/[-_]/)[0];
      if (!primary) return undefined;
      if (localization.get(primary)) return primary;
      var lowerPrimary = primary.toLowerCase();
      for (var j = 0; j < keys.length; j++) {
        if (keys[j].toLowerCase() === lowerPrimary) return keys[j];
      }
      return undefined;
    }

    if (currentConfig.OSRM_LANGUAGE) {
      var resolved = resolveCandidate(currentConfig.OSRM_LANGUAGE);
      return resolved || currentConfig.OSRM_LANGUAGE;
    }

    if (typeof window !== 'undefined' && window.navigator) {
      var nav = window.navigator;
      var candidates = [];

      if (Array.isArray(nav.languages)) {
        candidates = candidates.concat(nav.languages);
      }
      if (nav.language) candidates.push(nav.language);
      if (nav.userLanguage) candidates.push(nav.userLanguage); // IE fallback

      for (var i = 0; i < candidates.length; i++) {
        var lang = candidates[i];
        if (!lang) continue;
        var resolvedLang = resolveCandidate(lang);
        if (resolvedLang) return resolvedLang;
      }
    }
  } catch (e) {
    // Ignore detection errors and fall back to default
    console.warn('Error detecting browser language:', e);
  }

  // Fallback to English when no browser language matches
  return 'en';
}


/**
 * Get the default base tile layer name from the runtime config (`OSRM_DEFAULT_LAYER` env var).
 *
 * Returns the configured value, or `'streets'` (CartoDB Voyager) when unset.
 * Key validation (and fallback for unrecognized values) happens at the call
 * site via `layerMap[getDefaultLayer()] || streets`.
 *
 * @returns {string} The default layer key (default `'streets'`).
 */
function getDefaultLayer() {
  return config.OSRM_DEFAULT_LAYER || 'streets';
}

/**
 * Maps config-level layer name strings to the pre-created `L.tileLayer` instances.
 * Used by `getDefaultLayer()` to resolve `OSRM_DEFAULT_LAYER` into an actual layer
 * for `defaultState.layer`.
 *
 * @type {Object<string, L.TileLayer>}
 */
var layerMap = {
  streets: streets,
  outdoors: outdoors,
  satellite: satellite,
  osm: osm,
  osm_de: osm_de
};

var defaultLayer = layerMap[getDefaultLayer()] || streets;

/**
 * Build the services array consumed by the routing control and mode selector.
 *
 * Each entry exposes a human-readable `label`, a `labelKey` for localization,
 * the `path` used for routing requests (`/route/v1` appended to the backend URL
 * by default), an internal `profile` identifier (`driving`, `bike`, `foot`), and
 * an optional `debugUrl` pointing at the debug map for that mode.
 *
 * @returns {Array<{label: string, labelKey: string, path: string, profile: string, debugUrl?: string}>}
 *   An array of service descriptors, one per configured routing mode.
 */
function buildServices() {
  var modes = parseModes();
  var defaultLabelMapping = {
    driving: 'Car',
    bike: 'Bike',
    foot: 'Foot',
    default: 'Car'
  };
  return modes.map(function(mode) {
    var name = mode.name;
    var label = mode.label || name;
    var labelKey = mode.labelKey || defaultLabelMapping[name] || label;
    var service = {
      label: label,
      labelKey: labelKey,
      path: mode.path || (mode.url + '/route/v1'),
      profile: mode.profile
    };
    if (mode.debugUrl) service.debugUrl = mode.debugUrl;
    return service;
  });
}

/**
 * Central configuration for the OSRM frontend.
 *
 * This module is the single source of truth for map layers, routing services,
 * geocoding, and default view state. Nearly every value can be overridden at
 * runtime via environment variables (exposed as `window.osrmConfig`).
 *
 * ## Exported properties
 *
 * | Property       | Type     | Purpose |
 * |----------------|----------|---------|
 * | `defaultState` | `object` | Initial map center, zoom, language, units, and base layer. Merged with URL params at startup. |
 * | `services`     | getter   | Routing mode list built from `OSRM_MODES` / `OSRM_BACKEND` env vars. Drives the mode-selector dropdown. |
 * | `layer`        | `array`  | Base tile layers shown in the Leaflet layer control (first argument to `L.control.layers`). |
 * | `overlay`      | `object` | Togglable overlay tile layers (second argument to `L.control.layers`). |
 * | `nominatim`    | `object` | Geocoding endpoint configuration. |
 *
 * ## Runtime environment variables (via `window.osrmConfig`)
 *
 * | Variable               | Default                          | Description |
 * |------------------------|----------------------------------|-------------|
 * | `OSRM_MODES`           | (public OSRM services)           | JSON array of `{name, url, path?, profile?, debugUrl?}` routing backends. `profile` defaults by position (driving → bike → foot). `debugUrl` overrides the debug map link for that mode. |
 * | `OSRM_BACKEND`         | —                                | **Deprecated.** Single backend URL. Use `OSRM_MODES` instead. |
 * | `OSRM_CENTER`          | `38.8995,-77.0269`               | Comma-separated "lat,lng" for the initial map center. |
 * | `OSRM_ZOOM`            | `13`                             | Initial zoom level (0–18). |
 * | `OSRM_LANGUAGE`        | (browser language → `'en'`)      | UI language override. |
 * | `OSRM_DEFAULT_LAYER`   | `'streets'`                      | Default base layer key: `streets`, `outdoors`, `satellite`, `osm`, or `osm_de`. |
 * | `OSRM_LABEL`           | `'Car (fastest)'`                | Label for the default routing service. |
 * | `OSRM_ENVIRONMENT`     | —                                | Set to `'docker'` to use Docker-mode backend defaults. |
 * | `OSRM_CARTO_KEY`       | — (bundled key on project-osrm.org) | CARTO Basemaps key for the Streets layer. Without one CARTO watermarks the tiles; they still render. |
 *
 * @module leaflet_options
 */
var leafletOptions = {

  /**
   * Default map state applied at startup. Merged with URL query parameters
   * (`?loc=…&hl=…&z=…&ly=…`) so URL values take precedence.
   *
   * @type {object}
   * @property {L.LatLng}  center      — Initial map center (from `OSRM_CENTER` or Washington, DC).
   * @property {number}    zoom        — Initial zoom level (from `OSRM_ZOOM`, default 13).
   * @property {Array}     waypoints   — Empty at startup; populated by URL `loc` params or user clicks.
   * @property {string}    language    — UI language code (from `OSRM_LANGUAGE`, browser, or `'en'`).
   * @property {string}    units       — `'metric'` or `'imperial'`.
   * @property {number}    alternative — Selected route alternative index (0 = best).
   * @property {L.TileLayer} layer     — Resolved default base tile layer (from `OSRM_DEFAULT_LAYER`).
   */
  defaultState: {
    center: parseCenter(),
    zoom: getZoom(),
    waypoints: [],
    language: getLanguage(),
    units: 'metric',
    alternative: 0,
    layer: defaultLayer
  },
  /**
   * Routing services available in the mode-selector dropdown.
   *
   * This is a getter so it always reflects the current runtime config.
   * Each entry has:
   * - `label`      — human-readable display name (e.g. "Car (fastest)")
   * - `labelKey`   — localization key (e.g. "Car", "Bike", "Foot")
   * - `path`       — full routing endpoint (e.g. `https://…/route/v1`)
   * - `profile`    — internal routing profile: `'driving'`, `'bike'`, or `'foot'`
   *
   * Built from `OSRM_MODES` (preferred) or `OSRM_BACKEND` (deprecated).
   *
   * @type {Array<{label: string, labelKey: string, path: string, profile: string}>}
   */
  get services() {
    return buildServices();
  },

  /**
   * Base tile layers shown in the Leaflet layer-control radio buttons.
   *
   * Format: an array containing a single object that maps display names
   * (shown in the UI) to `L.TileLayer` instances. This is the standard
   * Leaflet format for the first argument to `L.control.layers()`.
   *
   * **Default base layers:**
   * - **Streets** — CartoDB Voyager (raster tiles, max zoom 19)
   * - **Outdoors** — OpenTopoMap (max zoom 17)
   * - **Satellite** — ESRI World Imagery (max zoom 19)
   * - **openstreetmap.org** — Standard OSM tile layer
   * - **openstreetmap.de** — German OSM tile layer
   *
   * **Customizing:** To add or replace base layers, define a `L.tileLayer`
   * and add an entry to this object. To change the *default* layer, set
   * `OSRM_DEFAULT_LAYER` to one of the layer keys (`layerMap` in this file)
   * or edit `defaultState.layer`.
   *
   * @type {Array<Object<string, L.TileLayer>>}
   */
  layer: [{
    'Streets': streets,
    'Outdoors': outdoors,
    'Satellite': satellite,
    'openstreetmap.org': osm,
    'openstreetmap.de': osm_de
  }],
  /**
   * Togglable overlay tile layers shown in the Leaflet layer control.
   *
   * These are rendered *on top of* the selected base layer and can be
   * independently shown or hidden by the user via checkboxes.
   *
   * **Built-in overlays:**
   * - **Hiking** — Waymarked Trails hiking routes
   *   ([waymarkedtrails.org](https://waymarkedtrails.org/), CC-BY-SA)
   * - **Bike** — Waymarked Trails cycling routes
   *   ([waymarkedtrails.org](https://waymarkedtrails.org/), CC-BY-SA).
   *   *Auto-activated* when a bike-type profile is selected.
   * - **Small Components** — GeoFabrik OSM Inspector routing debug tiles
   *   ([tools.geofabrik.de](https://tools.geofabrik.de/osmi/tiles/routing/)).
   *   Highlights small disconnected road segments. Stored overlay preference
   *   is restored from localStorage on reload for non-bike profiles.
   *
   * @type {Object<string, L.TileLayer>}
   */
  overlay: {
    'Hiking': hiking,
    'Bike': bike,
    'Small Components': small_components
  },
  /**
   * Geocoding (address search) endpoint configuration.
   *
   * Uses the public Nominatim service at openstreetmap.org by default.
   * Self-hosters may point this at a private Nominatim instance.
   *
   * @type {{path: string}}
   */
  nominatim: {
    path: 'https://nominatim.openstreetmap.org/'
  }
};

module.exports = leafletOptions;
