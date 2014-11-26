"use strict";

var itineraryBuilder = require('./itinerary_builder.js');
var createGeocoder = require('./geocoder.js');
var createPopup = require('./waypoint_popup.js');

var options = {
  lrm: {
    routeWhileDragging: true,
    addWaypoints: true,
    addButtonClassName: 'mapbox-directions-button-add',
    waypointMode: 'snap',
    pointMarkerStyle: {
      radius: 7,
      color: 'white',
      fillColor: '#3BB2D0',
      opacity: 1,
      fillOpacity: 0.7,
      weight: 1,
    },
    lineOptions: {
      styles: [
        {color: 'black', opacity: 0.35, weight: 7},
        {color: 'white', opacity: 0.8, weight: 5},
        {color: '#3BB2D0', opacity: 1, weight: 3}
      ],
    },
    dragStyles: [
      {color: 'black', opacity: 0.15, weight: 7},
      {color: 'white', opacity: 0.3, weight: 4},
      {color: '#3BB2D0', opacity: 1, weight: 2, dashArray: '7,12'}
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
    uturnButtonClass: 'mapbox-directions-icon mapbox-u-turn-icon'
  },

  tools: {
    popupWindowClass: "fill-dark dark",
    popupCloseButtonClass: 'mapbox-directions-icon mapbox-close-icon',
    linkButtonClass: 'mapbox-directions-icon mapbox-link-icon',
    editorButtonClass: 'mapbox-directions-icon mapbox-editor-icon',
    josmButtonClass: 'mapbox-directions-icon mapbox-josm-icon',
    languageButtonClass: 'mapbox-directions-icon mapbox-flag-icon',
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

