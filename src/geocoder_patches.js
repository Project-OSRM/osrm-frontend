'use strict';

var L = require('leaflet');

/**
 * Patches for geocoder widgets to prevent click propagation to the map.
 * Without this patch, clicks on geocoder elements (especially the close button)
 * bubble up to the map and trigger waypoint creation at the cursor position.
 */
module.exports = function() {
  // Patch the main geocoders container to prevent click propagation
  var patchGeocodersContainer = setInterval(function() {
    var geocoderContainers = document.querySelectorAll('.leaflet-routing-geocoders');
    if (geocoderContainers.length > 0) {
      geocoderContainers.forEach(function(container) {
        if (!container._clickPropagationPatched) {
          L.DomEvent.disableClickPropagation(container);
          // Also explicitly stop click events from propagating up to the map
          L.DomEvent.on(container, 'click', function(e) {
            e.stopPropagation();
          });
          container._clickPropagationPatched = true;
        }
      });
      clearInterval(patchGeocodersContainer);
    }
  }, 100);
};

