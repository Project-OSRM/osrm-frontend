"use strict";

var geocoder = function(i, num) {
  var container = L.DomUtil.create('div',
                                   function() {
                                     if (i === 0) {
                                       return "mapbox-directions-origin";
                                     } else if (i === num-1) {
                                       return "mapbox-directions-destination";
                                     }
                                     return "mapbox-directions-via";
                                   }()),
      label = L.DomUtil.create('label', 'mapbox-form-label', container),
      input = L.DomUtil.create('input', '', container),
      close = L.DomUtil.create('span', 'mapbox-directions-icon mapbox-close-icon', container),
      name = String.fromCharCode(65 + i),
      icon = L.DomUtil.create('div', 'leaflet-osrm-geocoder-label', label);

  icon.innerHTML = name;

  return {
    container: container,
    input: input,
    closeButton: close,
  };
};

module.exports = geocoder;

