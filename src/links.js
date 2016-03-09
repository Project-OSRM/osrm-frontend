'use strict';

var url = require('url'),
  jsonp = require('jsonp');

function _formatCoord(latLng) {
  var precision = 6;
  if (!latLng) {
    return;
  }
  return latLng.lat.toFixed(precision) + "," + latLng.lng.toFixed(precision);
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

function _parseInteger(intStr) {
  var integer = parseInt(intStr);
  if (isNaN(integer)) {
    throw {
      name: 'InvalidInt',
      message: "\"" + intStr + "\" is not a valid integer."
    };
  }
  return integer;
}

function formatLink(baseURL, options) {
  var parsed = url.parse(baseURL),
    formated = url.format({
      protocol: parsed.protocol,
      host: parsed.host,
      pathname: parsed.pathname,
      query: {
        z: options.zoom,
        center: options.center ? _formatCoord(options.center) : undefined,
        loc: options.waypoints ? options.waypoints.filter(function(wp) {
            return wp.latLng !== undefined;
          })
          .map(function(wp) {
            return wp.latLng;
          })
          .map(_formatCoord) : undefined,
        hl: options.language,
        ly: options.layer,
        alt: options.alternative,
        df: options.units,
        srv: options.service
      }
    });
  // no layer, no service
  return formated;
}

function parseLink(link) {
  link = '?' + link.slice(1);
  var parsed = url.parse(link, true),
    q = parsed.query,
    parsedValues = {},
    options = {},
    k;
  try {
    parsedValues.zoom = q.zoom && _parseInteger(q.zoom) || 10;
    parsedValues.center = q.center && _parseCoord(q.center);
    parsedValues.waypoints = q.loc && q.loc.filter(function(loc) { return loc != ""; }).map(_parseCoord).map(
      function(coord) {
        return L.Routing.waypoint(coord);
      }
    );
    parsedValues.language = q.hl;
    parsedValues.alternative = q.alt;
    parsedValues.units = q.df;
    parsedValues.layer = q.ly;
    parsedValues.service = q.srv;
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

