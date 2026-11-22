'use strict';

var L = require('leaflet');
var localization = require('./localization');

function createLegend(map, modeContainer, language) {
  var legend = L.DomUtil.create('span', 'osrm-access-legend');
  modeContainer.insertAdjacentElement('afterend', legend);
  var captions = {};
  [['restricted', 'Not permitted'], ['limited', 'Limited access']].forEach(function(item) {
    var entry = L.DomUtil.create('span', 'osrm-access-legend-entry', legend);
    var swatch = L.DomUtil.create('span', 'osrm-access-swatch ' + item[0], entry);
    swatch.setAttribute('aria-hidden', 'true');
    captions[item[1]] = L.DomUtil.create('span', '', entry);
  });
  function update() {
    var property;
    map.eachLayer(function(layer) {
      if (layer.getAccessProperty) property = layer.getAccessProperty() || property;
    });
    var hidden = !property || map.getZoom() <= 16;
    if (legend.hidden !== hidden) legend.hidden = hidden;
  }
  function updateLocalization(nextLanguage) {
    language = nextLanguage || language;
    Object.keys(captions).forEach(function(key) {
      captions[key].textContent = localization.t(language, key);
    });
  }
  var events = 'layeradd layerremove baselayerchange zoomend accessstylechange';
  map.on(events, update);
  map.on('unload', function() {
    map.off(events, update);
    legend.remove();
  });
  updateLocalization(language);
  update();
  return { container: legend, updateLocalization: updateLocalization };
}

module.exports = { createLegend: createLegend };
