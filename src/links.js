"use strict";

var url = require('url');

function _formatCoord(latLng)
{
  var precision = 6;
  return latLng.lat.toFixed(precision) + "," + latLng.lng.toFixed(precision);
}

function _parseCoord(coordStr)
{
  var latLng = coordStr.split(','),
      lat = parseFloat(latLng[0]),
      lon = parseFloat(latLng[1]);

  if (isNaN(lat) || isNaN(lon)) {
    throw {name: 'InvalidCoords', message: "\"" + coordStr + "\" is not a valid coordinate."};
  }

  return L.latLng(lat,lon);
}

function _parseInteger(intStr)
{
  var integer = parseInt(intStr);

  if (isNaN(integer)) {
    throw {name: 'InvalidInt', message: "\"" + intStr + "\" is not a valid integer."};
  }

  return integer;
}

function formatLink(baseURL, options)
{
  var parsed = url.parse(baseURL),
      formated = url.format({
        protocol: parsed.protocol,
        host: parsed.host,
        pathname: parsed.pathname,
        query: {
          z: options.zoom,
          center: options.center ? _formatCoord(options.center) : undefined,
          loc: options.waypoints ? options.waypoints.map(function(wp) {return wp.latLng;}).map(_formatCoord) : undefined,
        },
      });
  return formated;
}

/*
 * TODO:
 * hl -> language
 * ly -> layer
 * alt -> isAlternative
 * df -> distanceUnit
 */
function parseLink(link)
{
  var parsed = url.parse(link, true),
      q = parsed.query,
      parsedValues = {},
      options = {},
      k;

  try {
    parsedValues.zoom      = q.zoom   && _parseInteger(q.zoom);
    parsedValues.center    = q.center && _parseCoord(q.center);
    parsedValues.waypoints = q.loc    && q.loc.map(_parseCoord).map(
      function (coord) {
        return { latLng: coord, };
      }
    );
  } catch (e) {
    console.log("Exception " + e.name + ": " + e.message);
  }

  for (k in parsedValues)
  {
    if (parsedValues[k] !== undefined && parsedValues[k] !== "")
    {
      options[k] = parsedValues[k];
    }
  }

  return options;
}

module.exports = {
  'parseLink': parseLink,
  'formatLink': formatLink,
};
