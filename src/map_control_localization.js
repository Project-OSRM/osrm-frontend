'use strict';

var L = require('leaflet');
var localization = require('./localization');

module.exports = function(map, layersControl, locationControl, language) {
  function translate(key) {
    return localization.t(language, key);
  }
  var container = map.getContainer();
  var titles = {
    '.leaflet-control-zoom-in': 'Zoom in',
    '.leaflet-control-zoom-out': 'Zoom out',
    '.leaflet-control-layers-toggle': 'Layers',
    '.leaflet-control-locate a, .leaflet-control-locate button': 'Show my location'
  };
  Object.keys(titles).forEach(function(selector) {
    var button = container.querySelector(selector);
    if (button) {
      button.title = translate(titles[selector]);
      button.setAttribute('aria-label', button.title);
    }
  });
  if (locationControl && locationControl.options.strings) locationControl.options.strings.title = translate('Show my location');
  var layers = layersControl.getContainer();
  Array.prototype.forEach.call(layers.querySelectorAll('.leaflet-control-layers-selector'), function(input) {
    var entry = layersControl._layers.find(function(item) {
      return L.stamp(item.layer) === input.layerId;
    });
    // Keep canonical layer names untouched for links and stored preferences.
    if (entry && input.nextSibling) input.nextSibling.textContent = ' ' + translate(entry.name);
  });
};
