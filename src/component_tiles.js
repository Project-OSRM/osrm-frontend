'use strict';

// Infer only the standard OSRM route endpoint. Custom routing paths need an
// explicit template: a debug map URL does not identify a tile service.
function tileTemplate(service, baseUrl) {
  if (!service || service.tileUrl === false) return null;
  var profile = encodeURIComponent(service.profile || 'driving');
  var configured = service.tileUrl;
  var base = baseUrl || (typeof document !== 'undefined' ? document.baseURI : 'http://localhost/');
  try {
    if (configured !== undefined) {
      if (typeof configured !== 'string' || !['x', 'y', 'z'].every(function(axis) {
        return configured.includes('{' + axis + '}');
      })) return null;
      var explicit = new URL(configured.replace(/\{profile\}/g, profile), base);
      if (!/^https?:$/.test(explicit.protocol)) return null;
      return explicit.href.replace(/%7B/gi, '{').replace(/%7D/gi, '}');
    }
    var route = new URL(service.path, base);
    if (!/^https?:$/.test(route.protocol) || route.search || route.hash || !/\/route\/v1\/?$/.test(route.pathname)) return null;
    route.pathname = route.pathname.replace(/\/route\/v1\/?$/, '/tile/v1/' + profile + '/tile({x},{y},{z}).mvt');
    return route.href.replace(/%7B/gi, '{').replace(/%7D/gi, '}');
  } catch (error) {
    return null;
  }
}

function componentStyle(url) {
  return {
    version: 8,
    sources: {
      osrm: { type: 'vector', tiles: [url], minzoom: 12, maxzoom: 19,
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }
    },
    layers: [{
      id: 'small-routing-components', type: 'line', source: 'osrm', 'source-layer': 'speeds', minzoom: 12,
      filter: ['==', ['get', 'is_small'], true],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#ed58d1', 'line-opacity': 0.95,
        'line-width': ['interpolate', ['linear'], ['zoom'], 12, 2, 19, 7] }
    }]
  };
}

module.exports = { tileTemplate: tileTemplate, componentStyle: componentStyle };
