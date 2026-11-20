'use strict';

var roadShields = require('./road_shields');
var poiIcons = require('./poi_icons');

function registerVectorImages(map) {
  // MapLibre 6 must receive generated images inside this resolver, before the
  // tile response is built. Share one resolver across road plates and POIs.
  map.setMissingStyleImageResolver(function(id) {
    if (map.hasImage(id)) return;
    var definition = roadShields.imageDefinition(id) || poiIcons.imageDefinition(id);
    if (definition) map.addImage(id, definition.image, definition.options);
  });
}

module.exports = { registerVectorImages: registerVectorImages };
