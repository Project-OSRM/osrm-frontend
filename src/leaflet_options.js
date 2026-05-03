'use strict';

var L = require('leaflet');

// Load runtime configuration (from window.osrmConfig set by index.html)
// In Node/test environments, window won't exist, so use empty config
var config = (typeof window !== 'undefined' ? window.osrmConfig : null) || {};

var osmAttribution = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  cartoAttribution = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attribution">CARTO</a>',
  esriAttribution = 'Tiles © <a href="https://www.esri.com/">Esri</a> — Source: Esri, DigitalGlobe, GeoEye, Earthstar Geographics, CNES/Airbus DS, USDA, USGS, AeroGRID, IGN, and the GIS User Community',
  waymarkedtrailsAttribution = '© <a href="https://waymarkedtrails.org/">Sarah Hoffmann</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)';

var streets = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
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

// Parse center coordinates from config with validation
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

// Get service label from config
function getLabel() {
  return config.OSRM_LABEL || 'Car (fastest)';
}

// Parse routing modes from runtime config.
// OSRM_MODES is the preferred JSON-based format: [{ name, url }, ...].
// OSRM_BACKEND is deprecated and only kept as a single-backend fallback.
// Priority: OSRM_MODES > OSRM_BACKEND (with deprecation warning) > environment defaults.
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
          return {
            name: mode.name || ('Mode ' + (index + 1)),
            url: mode.url || 'http://localhost:5000',
            profile: profileNames[index] || 'driving'  // Use standard profile for routing
          };
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
  
  // Docker mode default: single "default" profile using localhost:5000
  return [
    { name: 'default', url: 'http://localhost:5000', profile: 'driving' }
  ];
}

// Get backend URL based on environment and profile
// In Docker: use configured OSRM_BACKEND_* (defaults to OSRM_BACKEND)
// In dev: use public OSRM services
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

// Legacy functions for backward compatibility
// Get backend URL based on environment
// In Docker: use configured OSRM_BACKEND (defaults to localhost:5000)
// In dev: use public routing.project-osrm.org service
function getBackend() {
  return getBackendForProfile('driving');
}

// Get bike/foot backend URL based on environment
// In Docker: use configured OSRM_BACKEND_BIKE/OSRM_BACKEND_FOOT
// In local dev: use known public services (routing.openstreetmap.de)
function getAlternativeBackend() {
  // In Docker: use bike backend
  if (config.OSRM_ENVIRONMENT === 'docker') {
    return getBackendForProfile('bike') || getBackend();
  }
  // Local dev mode: use public routing services
  return undefined;
}

// Get zoom level from config with validation
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

// Get language, prefer browser settings when available; fallback to 'en'.
// Precedence (effective): URL param (handled in index.js) > browser language > 'en'
function getLanguage() {
  try {
    if (typeof window !== 'undefined' && window.navigator) {
      var nav = window.navigator;
      var candidates = [];

      if (Array.isArray(nav.languages)) {
        candidates = candidates.concat(nav.languages);
      }
      if (nav.language) candidates.push(nav.language);
      if (nav.userLanguage) candidates.push(nav.userLanguage); // IE fallback

      var localization = require('./localization');
      for (var i = 0; i < candidates.length; i++) {
        var lang = candidates[i];
        if (!lang) continue;
        lang = lang.trim();
        // exact match (e.g., 'pt-BR')
        if (localization.get(lang)) {
          return lang;
        }
        // primary subtag match (e.g., 'en-US' -> 'en')
        var short = lang.split('-')[0];
        if (localization.get(short)) {
          return short;
        }
      }
    }
  } catch (e) {
    // Ignore detection errors and fall back to default
    console.warn('Error detecting browser language:', e);
  }

  // Fallback to English when no browser language matches
  return 'en';
}

// Get default layer from config
function getDefaultLayer() {
  return config.OSRM_DEFAULT_LAYER || 'streets';
}

var layerMap = {
  streets: streets,
  outdoors: outdoors,
  satellite: satellite,
  osm: osm,
  osm_de: osm_de
};

var defaultLayer = layerMap[getDefaultLayer()] || streets;

// Build services array from OSRM_MODES config
// Each service has a name, URL prefix, and internal profile for routing
function buildServices() {
  var modes = parseModes();
  return modes.map(function(mode) {
    return {
      label: mode.name,
      path: mode.path || (mode.url + '/route/v1'),
      profile: mode.profile
    };
  });
}

var leafletOptions = {
  defaultState: {
    center: parseCenter(),
    zoom: getZoom(),
    waypoints: [],
    language: getLanguage(),
    units: 'metric',
    alternative: 0,
    layer: defaultLayer
  },
  get services() {
    return buildServices();
  },
  layer: [{
    'Streets': streets,
    'Outdoors': outdoors,
    'Satellite': satellite,
    'openstreetmap.org': osm,
    'openstreetmap.de': osm_de
  }],
  overlay: {
    'Hiking': hiking,
    'Bike': bike,
    'Small Components': small_components
  },
  baselayer: {
    one: streets,
    two: outdoors,
    three: satellite,
    four: osm,
    five: osm_de
  }
};

module.exports = leafletOptions;
