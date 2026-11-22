'use strict';

var mapView = require('./leaflet_options');
var createGeocoder = require('./geocoder');
var darkTheme = mapView.vectorTheme === 'dark';
var routeColor = darkTheme ? '#3482ff' : '#022bb1';
var alternativeColor = darkTheme ? '#719bd0' : '#40007d';

// The connector takes the colour of the route it belongs to, so an alternative's
// gap is not mistaken for the selected route's. The halo is dashed on the
// identical pattern as the line it sits under, so the whole connector stays
// visibly broken rather than reading as a solid casing with dashes on top.
function missingRouteStyles(color) {
  return [
    {color: 'white', opacity: 0.75, weight: 7, dashArray: '3,9', lineCap: 'round'},
    {color: color, opacity: 0.85, weight: 3, dashArray: '3,9', lineCap: 'round'}
  ];
}

module.exports = {
  lrm: {
    lineOptions: {
      styles: darkTheme ? [
        {color: '#89b5ff', opacity: 0.65, weight: 9},
        {color: routeColor, opacity: 1, weight: 6}
      ] : [
        {color: '#022bb1', opacity: 0.8, weight: 8},
        {color: 'white', opacity: 0.3, weight: 6}
      ],
      // The gap between where the route can actually reach and the waypoint
      // itself — the walk across a forecourt to a door, say. Leaflet Routing
      // Machine's default draws this as a solid black casing and a solid white
      // core with thin dashes laid over them, which against this app's heavy
      // blue route reads as more route. Every style here is dashed on the same
      // pattern, so the connector can only ever read as "not part of the route".
      missingRouteStyles: missingRouteStyles(routeColor)
    },
    altLineOptions: {
      styles: darkTheme ? [
        {color: '#3d5b82', opacity: 0.7, weight: 9},
        {color: alternativeColor, opacity: 0.9, weight: 6}
      ] : [
        {color: '#40007d', opacity: 0.4, weight: 8},
        {color: 'black', opacity: 0.5, weight: 2, dashArray: '2,4' },
        {color: 'white', opacity: 0.3, weight: 6}
      ],
      missingRouteStyles: missingRouteStyles(alternativeColor)
    },
    dragStyles: [
      {color: 'black', opacity: 0.35, weight: 9},
      {color: 'white', opacity: 0.8, weight: 7}
    ],
    routeWhileDragging: true,
    summaryTemplate: darkTheme ? require('./route_summary') : '<div class="osrm-directions-summary"><h2>{name}</h2><h3>{distance}, {time}</h3></div>',
    containerClassName: 'dark pad2',
    alternativeClassName: 'osrm-directions-instructions',
    stepClassName: 'osrm-directions-step',
    geocodersClassName: 'osrm-directions-inputs',
    createGeocoder: createGeocoder,
    showAlternatives: true,
    useZoomParameter: false,
    // 200ms is five requests a second per drag, which the public demo servers
    // rate-limit. Slower still feels live, and route_throttle backs off further
    // if the service starts refusing anyway.
    routeDragInterval: 500,
    collapsible: true
  },
  popup: {
    removeButtonClass: 'osrm-directions-icon osrm-close-light-icon',
    uturnButtonClass: 'osrm-directions-icon osrm-u-turn-icon'
  },
  tools: {
    popupWindowClass: 'fill-osrm dark',
    popupCloseButtonClass: 'osrm-directions-icon osrm-close-icon',
    editorButtonClass: 'osrm-directions-icon osrm-editor-icon',
    josmButtonClass: 'osrm-directions-icon osrm-josm-icon',
    debugButtonClass: 'osrm-directions-icon osrm-debug-icon',
    mapillaryButtonClass: 'osrm-directions-icon osrm-mapillary-icon',
    shareButtonClass: 'osrm-directions-icon osrm-share-icon',
    gpxButtonClass: 'osrm-directions-icon osrm-gpx-icon',
    localizationChooserClass: 'osrm-localization-chooser',
    profileChooserClass: 'osrm-profile-chooser',
    printButtonClass: 'osrm-directions-icon osrm-printer-icon',
    toolsContainerClass: 'fill-osrm dark',
    position: 'bottomleft'
  }
};
