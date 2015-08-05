'use strict';

var mapView = require('./leaflet_options');

module.exports = {
  lrm: {
    lineOptions: {
      styles: [
        {color: '#40007d', opacity: 0.8, weight: 8},
        {color: 'white', opacity: 0.3, weight: 6}
      ]
    },
    altLineOptions: {
      styles: [
        {color: '#022bb1', opacity: 0.8, weight: 8},
        {color: 'white', opacity: 0.3, weight: 6}
      ]
    },
    dragStyles: [
      {color: 'black', opacity: 0.35, weight: 9},
      {color: 'white', opacity: 0.8, weight: 7}
    ],
    summaryTemplate: '<div class="osrm-directions-summary"><h2>{name}</h2><h3>{distance}, {time}</h3></div>',
    containerClassName: 'dark pad2',
    alternativeClassName: 'osrm-directions-instructions',
    stepClassName: 'osrm-directions-step',
    geocodersClassName: 'osrm-directions-inputs',
    itineraryBuilder: 'osrm-directions-steps'
  },

  popup: {
    removeButtonClass: 'osrm-directions-icon osrm-close-light-icon',
    uturnButtonClass: 'osrm-directions-icon osrm-u-turn-icon',
    markerOptions: {
    }
  },

  tools: {
    popupWindowClass: 'fill-osrm dark',
    popupCloseButtonClass: 'osrm-directions-icon osrm-close-icon',
    linkButtonClass: 'osrm-directions-icon osrm-link-icon',
    editorButtonClass: 'osrm-directions-icon osrm-editor-icon',
    josmButtonClass: 'osrm-directions-icon osrm-josm-icon',
    localizationButtonClass: 'osrm-directions-icon osrm-flag-icon',
    printButtonClass: 'osrm-directions-icon osrm-printer-icon',
    toolsContainerClass: 'fill-osrm dark',
    language: mapView.defaultView.language
  }
};
