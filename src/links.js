'use strict';

var L = require('leaflet');
var qs = require('qs');
var jsonp = require('jsonp');
var routePreferences = require('./route_preferences');

function _formatCoord(latLng) {
  var precision = 6;
  if (!latLng) {
    return;
  }
  var coord = typeof latLng.wrap === 'function' ? latLng.wrap() : latLng;
  return coord.lat.toFixed(precision) + "," + coord.lng.toFixed(precision);
}

function _parseCoord(coordStr) {
  var latLng = coordStr.split(','),
    lat = parseFloat(latLng[0]),
    lon = parseFloat(latLng[1]);
  if (isNaN(lat) || isNaN(lon)) {
    throw {
      name: 'InvalidCoords',
      message: "\"" + coordStr + "\" is not a valid coordinate."
    };
  }
  return L.latLng(lat, lon);
}

function _parseZoom(value) {
  var zoom = parseFloat(value);
  if (!isFinite(zoom)) {
    throw {
      name: 'InvalidZoom',
      message: "\"" + value + "\" is not a valid zoom."
    };
  }
  return zoom;
}

function _formatLayer(layer) {
  if (!layer) return undefined;
  if (typeof layer === 'string') return layer;
  if (typeof layer === 'object') {
    if (typeof layer.label === 'string') return layer.label;
    if (layer.options && typeof layer.options.id === 'string') return layer.options.id;
    if (typeof layer.name === 'string') return layer.name;
  }
  return undefined;
}

function formatLink(options) {
  // Output all waypoints as loc parameters, using empty string for missing
  var locs = undefined;
  if (options.waypoints) {
    locs = options.waypoints.map(function(wp) {
      return wp && wp.latLng ? _formatCoord(wp.latLng) : '';
    });
  }
  return qs.stringify({
    z: typeof options.zoom === 'number' ? Math.round(options.zoom * 1000) / 1000 : options.zoom,
    center: options.center ? _formatCoord(options.center) : undefined,
    loc: locs,
    hl: options.language,
    alt: options.alternative,
    scale: options.units,
    ly: _formatLayer(options.layer),
    srv: options.service,
    profile: options.profile,
    exclude: routePreferences.normalize(options).exclude || undefined,
    u: options.allowUTurns === true ? 'true' : undefined
  }, {indices: false});
}

function parseLink(link) {
  if (!link) return {};
  var q = qs.parse(link),
    parsedValues = {},
    options = {},
    k;
  try {
    if (q.z !== undefined && q.z !== null) parsedValues.zoom = _parseZoom(q.z);
    parsedValues.center = q.center && _parseCoord(q.center);
    if (q.loc) {
      if (q.loc.constructor === Array) {
        // any number of locs: start, via, end, etc.
        parsedValues.waypoints = q.loc.map(function(loc) {
          return loc && loc !== '' ? L.Routing.waypoint(_parseCoord(loc)) : L.Routing.waypoint(null);
        });
      } else if (q.loc.constructor === String) {
        // exactly one loc is given (backward compatibility)
        parsedValues.waypoints = [L.Routing.waypoint(_parseCoord(q.loc))];
      }
    }
    parsedValues.language = q.hl;
    parsedValues.alternative = q.alt;
    parsedValues.units = q.scale || q.df;
    parsedValues.layer = q.ly;
    parsedValues.service = q.srv;
    parsedValues.profile = q.profile;
    if (typeof q.exclude === 'string') parsedValues.exclude = routePreferences.normalize({ exclude: q.exclude }).exclude;
    if (q.u === 'true' || q.u === '1') parsedValues.allowUTurns = true;
    else if (q.u === 'false' || q.u === '0') parsedValues.allowUTurns = false;
    parsedValues.originAddress = q.src;
    parsedValues.destinationAddress = q.dst;
  } catch (e) {
    console.log("Exception " + e.name + ": " + e.message);
  }
  for (k in parsedValues) {
    if (parsedValues[k] !== undefined && parsedValues[k] !== "") {
      options[k] = parsedValues[k];
    }
  }
  return options;
}


module.exports = {
  'parse': parseLink,
  'format': formatLink
};

