"use strict";

var itineraryBuilder = require('./itinerary_builder.js');
var createGeocoder = require('./geocoder.js');
var theme = require('./directions_theme.js');
var links = require('./links.js');
var options = require('./options.js');
var tools = require('./tools.js');

var parsedOptions = links.parse(window.location.search);
var viewOptions = L.extend(options.viewDefaults, parsedOptions);

var map = L.map('map', {zoomControl: false}).setView(viewOptions.center, viewOptions.zoom);

var mapbox = L.tileLayer('https://{s}.tiles.mapbox.com/v3/dennisl.4e2aab76/{z}/{x}/{y}.png',
    {attribution: '&copy; <a href="http://mapbox.com/">MapBox</a> &copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'}
    ).addTo(map);

var controlOptions = L.extend(options.controlDefaults, theme.options);

var lrm = L.Routing.control(controlOptions);
lrm.addTo(map);

var toolsControl = tools.control(lrm, {
  position: 'bottomleft',
  linkButtonClass: theme.options.linkButtonClass,
  editorButtonClass: theme.options.editorButtonClass,
  josmButtonClass: theme.options.josmButtonClass,
  popupWindowClass: theme.options.popupWindowClass,
  popupCloseButtonClass: theme.options.popupCloseButtonClass,
  toolsContainerClass: theme.options.toolsContainerClass,
  });
toolsControl.addTo(map);

map.on('click', function(e) {
  var plan = lrm.getPlan(),
      wps = plan.getWaypoints(),
      i;
  for (i = 0; i < wps.length; i++)
  {
    if (wps[i].latLng === undefined || wps[i].latLng === null)
    {
      plan.spliceWaypoints(i, 1, e.latlng);
      break;
    }
  }
});

theme.setup(lrm);

lrm.setWaypoints(viewOptions.waypoints);
