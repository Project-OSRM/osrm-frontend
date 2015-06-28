"use strict";

var itineraryBuilder = require('./itinerary_builder.js');
var createGeocoder = require('./geocoder.js');

// Mapbox Blue
// var primiaryColor = '#3BB2D0';
var primarayColor = '#3c4e5a';
//var primarayColor = '#ee8a65';
var secondaryColor = '#f1f075';

var options = {
  lrm: {
    addButtonClassName: 'mapbox-directions-button-add',
    pointMarkerStyle: {
      radius: 6,
      color: 'black',
      fillColor: secondaryColor,
      opacity: 0.35,
      fillOpacity: 1.0,
      weight: 1,
    },
    lineOptions: {
      styles: [
        {color: 'black', opacity: 0.35, weight: 8},
        {color: 'white', opacity: 0.3, weight: 6},
        {color: primarayColor, opacity: 1.0, weight: 4}
      ],
    },
    dragStyles: [
      {color: 'black', opacity: 0.35, weight: 9},
      {color: 'white', opacity: 0.8, weight: 7},
      {color: primarayColor, opacity: 1, weight: 5, dashArray: '7,12'}
    ],
    summaryTemplate: '<div class="mapbox-directions-summary"><h2>{name}</h2><h3>{distance}, {time}</h3></div>',
    containerClassName: "dark pad2",
    alternativeClassName: "mapbox-directions-instructions",
    stepClassName: "mapbox-directions-step",
    geocodersClassName: "mapbox-directions-inputs",
    createGeocoder: createGeocoder,
    itineraryBuilder: itineraryBuilder({containerClassName: "mapbox-directions-steps"}),
  },

  popup: {
    removeButtonClass: 'mapbox-directions-icon mapbox-close-light-icon',
    uturnButtonClass: 'mapbox-directions-icon mapbox-u-turn-icon',
    markerOptions: {
    }
  },

  tools: {
    popupWindowClass: "fill-dark dark",
    popupCloseButtonClass: 'mapbox-directions-icon mapbox-close-icon',
    linkButtonClass: 'mapbox-directions-icon mapbox-link-icon',
    editorButtonClass: 'mapbox-directions-icon mapbox-editor-icon',
    josmButtonClass: 'mapbox-directions-icon mapbox-josm-icon',
    localizationButtonClass: 'mapbox-directions-icon mapbox-flag-icon',
    printButtonClass: 'icon printer',
    toolsContainerClass: 'fill-dark dark',
  }
};

module.exports = {
  options: options,
  // this hides the sidebar before the first route
  setup: function(lrm) {
      lrm.hide();
      lrm.on('routeselected', function(r) { lrm.show(); });
  }
};

