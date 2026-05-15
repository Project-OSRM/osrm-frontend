'use strict';

var links = require('./links');

function parse(q) {
  // Accept either a query-string (without '?') or default to current location
  if (!q && typeof window !== 'undefined') {
    q = window.location.search.slice(1);
  }
  return links.parse(q);
}

function format(options) {
  return links.format(options);
}

function _buildUrlFromOptions(options) {
  if (typeof window === 'undefined') return '';
  var baseURL = window.location.href.split('?')[0];
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
