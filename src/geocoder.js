'use strict';

var L = require('leaflet');

var geocoder = function(i, num) {
  var container = L.DomUtil.create('div',
      function() {
        if (i === 0) {
          return "osrm-directions-origin";
        } else if (i === num - 1) {
          return "osrm-directions-destination";
        }
        return "osrm-directions-via";
      }()),
    label = L.DomUtil.create('label', 'osrm-form-label', container),
    input = L.DomUtil.create('input', '', container),
    close = L.DomUtil.create('span', 'osrm-directions-icon osrm-close-icon', container),
    name = String.fromCharCode(65 + i),
    icon = L.DomUtil.create('div', 'leaflet-osrm-geocoder-label', label);
  icon.innerHTML = name;
  return {
    container: container,
    input: input,
    closeButton: close
  };
};

// Matches plain decimal coordinate strings such as "34.129382,-118.141254"
// or "34.129382 -118.141254" (with or without sign, comma or space separator).
// Mirrors the last regex branch in leaflet-control-geocoder's parseLatLng.
var COORD_PATTERN = /^\s*([+-]?\d+(?:\.\d*)?)\s*[\s,]\s*([+-]?\d+(?:\.\d*)?)\s*$/;

function parseCoords(query) {
  var m = query.match(COORD_PATTERN);
  return m ? L.latLng(+m[1], +m[2]) : null;
}

// Returns a geocoder that, when given coordinate input, preserves the exact
// lat/lon instead of snapping to the nearest address, while still calling
// Nominatim reverse-geocode so a human-readable name is displayed.
// For non-coordinate input, falls through to Nominatim forward-geocode as normal.
// Also bridges leaflet-control-geocoder's Promise API to the callback-based API
// that leaflet-routing-machine's autocomplete expects.
geocoder.coordPreserving = function() {
  var nominatim = L.Control.Geocoder.nominatim();

  function withCallback(promise, cb, context) {
    return promise.then(function(results) {
      if (typeof cb === 'function') cb.call(context, results);
      return results;
    }).catch(function() {
      var fallback = [];
      if (typeof cb === 'function') cb.call(context, fallback);
      return fallback;
    });
  }

  // Helper: reverse-geocodes coordinates for display name, but preserves exact latlng.
  function coordResult(latlng, query) {
    // Use scale corresponding to zoom level 18 (was hard-coded as 256 * 2^18 = 67108864)
    return nominatim.reverse(latlng, L.CRS.EPSG3857.scale(18)).then(function(results) {
      if (results && results.length > 0) {
        return [L.extend({}, results[0], {
          center: latlng,
          bbox: latlng.toBounds(1000)
        })];
      }
      return [{ name: query, center: latlng, bbox: latlng.toBounds(1000) }];
    }).catch(function() {
      return [{ name: query, center: latlng, bbox: latlng.toBounds(1000) }];
    });
  }

  return {
    geocode: function(query, cb, context) {
      var latlng = parseCoords(query);
      if (latlng) {
        return withCallback(coordResult(latlng, query), cb, context);
      }
      return withCallback(nominatim.geocode(query), cb, context);
    },

    suggest: function(query, cb, context) {
      var latlng = parseCoords(query);
      if (latlng) {
        // Coordinate input: return result with exact center so the
        // auto-selected dropdown item preserves the typed location.
        return withCallback(coordResult(latlng, query), cb, context);
      }
      return withCallback(nominatim.geocode(query), cb, context);
    },

    reverse: function(latlng, scale, cb, context) {
      return withCallback(nominatim.reverse(latlng, scale), cb, context);
    }
  };
};

module.exports = geocoder;
