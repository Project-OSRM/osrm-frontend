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

// Parse center coordinates from config
function parseCenter() {
  var centerStr = config.OSRM_CENTER || '38.8995,-77.0269';
  var parts = centerStr.split(/[, ]+/);
  return L.latLng(parseFloat(parts[0]), parseFloat(parts[1]));
}

// Get backend URL from config
function getBackend() {
  return config.OSRM_BACKEND || 'https://router.project-osrm.org';
}

// Get service label from config
function getLabel() {
  return config.OSRM_LABEL || 'Car (fastest)';
}

// Get zoom level from config
function getZoom() {
  return parseInt(config.OSRM_ZOOM || 13, 10);
}

// Get language from config
function getLanguage() {
  return config.OSRM_LANGUAGE || 'en';
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

module.exports = {
  defaultState: {
    center: parseCenter(),
    zoom: getZoom(),
    waypoints: [],
    language: getLanguage(),
    alternative: 0,
    layer: defaultLayer
  },
  services: [
    {
      label: getLabel(),
      path: getBackend() + '/route/v1',
      profile: 'driving'
    },
    {
      label: 'Bike',
      path: 'https://routing.openstreetmap.de/routed-bike/route/v1',
      profile: 'bike'
    },
    {
      label: 'Foot',
      path: 'https://routing.openstreetmap.de/routed-foot/route/v1',
      profile: 'foot'
    }
  ],
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
