'use strict';

var links = require('./links');

function parse(q) {
  // Accept either a query-string (without '?') or default to current location
  // Only default when q is omitted/nullish — but respect an explicit empty string
  if ((q === undefined || q === null) && typeof window !== 'undefined') {
    q = window.location.search.slice(1);
  }
  var parsed = links.parse(q);
  // Normalize Leaflet/LRM types to plain JS objects so callers don't need Leaflet
  try {
    if (parsed) {
      if (parsed.center && typeof parsed.center.lat === 'number' && typeof parsed.center.lng === 'number') {
        parsed.center = { lat: parsed.center.lat, lng: parsed.center.lng };
      }
      if (Array.isArray(parsed.waypoints)) {
        parsed.waypoints = parsed.waypoints.map(function(wp) {
          if (!wp) return undefined;
          if (wp && wp.latLng && typeof wp.latLng.lat === 'number' && typeof wp.latLng.lng === 'number') {
            return { lat: wp.latLng.lat, lng: wp.latLng.lng };
          }
          if (wp && typeof wp.lat === 'number' && typeof wp.lng === 'number') {
            return { lat: wp.lat, lng: wp.lng };
          }
          return undefined;
        });
      }
    }
  } catch (e) {
    // If normalization fails, return parsed as-is
    return parsed;
  }
  return parsed;
}

function format(options) {
  // Accept plain waypoint objects ({lat, lng}) and convert them to the
  // shape expected by links.format (objects with a .latLng property).
  if (!options) return links.format(options);
  var copy = Object.assign({}, options);
  if (Array.isArray(options.waypoints)) {
    copy.waypoints = options.waypoints.map(function(wp) {
      if (!wp) return wp;
      // Already in waypoint-like form
      if (wp.latLng) return wp;
      if (typeof wp.lat === 'number' && typeof wp.lng === 'number') {
        return { latLng: { lat: wp.lat, lng: wp.lng } };
      }
      if (Array.isArray(wp) && wp.length >= 2) {
        var lat = Number(wp[0]);
        var lng = Number(wp[1]);
        if (!isNaN(lat) && !isNaN(lng)) return { latLng: { lat: lat, lng: lng } };
      }
      return wp;
    });
  }
  // center is accepted as a plain {lat,lng} object by links.format
  if (options.center && typeof options.center.lat === 'number' && typeof options.center.lng === 'number') {
    copy.center = options.center;
  }
  return links.format(copy);
}

function _buildUrlFromOptions(options) {
  if (typeof window === 'undefined') return '';
  // Use origin + pathname to avoid preserving fragments when composing query strings
  var baseURL = (window.location.origin || (window.location.protocol + '//' + window.location.host)) + window.location.pathname;
  var newParms = links.format(options);
  return baseURL + (newParms ? ('?' + newParms) : '');
}

function replace(options) {
  if (typeof window === 'undefined') return;
  var newURL = _buildUrlFromOptions(options);
  try {
    window.history.replaceState({}, 'Project OSRM Demo', newURL);
  } catch (e) {
    // Fallback if history API is unavailable
    window.location.href = newURL;
  }
}

function push(options) {
  if (typeof window === 'undefined') return;
  var newURL = _buildUrlFromOptions(options);
  try {
    window.history.pushState({}, 'Project OSRM Demo', newURL);
  } catch (e) {
    window.location.href = newURL;
  }
}

function listen(callback) {
  if (typeof window === 'undefined') return function() {};
  var listener = function(event) {
    var params = parse(window.location.search.slice(1));
    try {
      callback(params, event);
    } catch (err) {
      console.error('Error in popstate listener callback:', err);
    }
  };
  window.addEventListener('popstate', listener);
  return function() {
    window.removeEventListener('popstate', listener);
  };
}

module.exports = {
  parse: parse,
  format: format,
  replace: replace,
  push: push,
  listen: listen
};
