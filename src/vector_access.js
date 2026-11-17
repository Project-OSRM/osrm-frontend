'use strict';

var STATE_KEY = 'osrm-access-property';

function propertyForProfile(profile) {
  var aliases = { driving: 'motorcar', car: 'motorcar', motorcar: 'motorcar', bike: 'bicycle', bicycle: 'bicycle', cycling: 'bicycle', foot: 'foot', walking: 'foot', pedestrian: 'foot' };
  return typeof profile === 'string' ? aliases[profile.trim().toLowerCase()] || null : null;
}

function applyProfile(layers, service) {
  Object.keys(layers || {}).forEach(function(name) {
    if (layers[name] && layers[name].setRoutingProfile) layers[name].setRoutingProfile(service && service.profile);
  });
}

function configureRenderer(renderer) {
  var property = null;
  renderer.options.globalState = Object.assign({}, renderer.options.globalState);
  renderer.options.globalState[STATE_KEY] = 'none';
  function apply() {
    var map = renderer.getMaplibreMap();
    if (map) map.setGlobalStateProperty(STATE_KEY, property || 'none');
  }
  renderer.setRoutingProfile = function(profile) {
    var next = propertyForProfile(profile);
    if (next === property) return;
    property = next;
    renderer.options.globalState[STATE_KEY] = property || 'none';
    var map = renderer.getMaplibreMap();
    if (!map) return;
    map.off('style.load', apply);
    if (map.getStyle()) apply();
    else map.once('style.load', apply);
  };
}

module.exports = { STATE_KEY: STATE_KEY, propertyForProfile: propertyForProfile, applyProfile: applyProfile, configureRenderer: configureRenderer };
