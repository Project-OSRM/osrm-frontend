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
      icon,
      iconName;
  if (i === 0) {
    iconName = "depart";
  } else if (i === num-1){
    iconName = "arrive";
  } else {
    iconName = "via";
  }
  icon  = L.DomUtil.create('div', 'mapbox-directions-icon mapbox-' + iconName  + '-icon', label);
  L.DomEvent.on(close, 'click', function(e) {
    input.value = "";
  });

  return {
    container: container,
    input: input,
  };
};

module.exports = geocoder;

