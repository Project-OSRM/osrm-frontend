"use strict";

var createGeocoder = require('./geocoder.js');
var theme = require('./directions_theme.js');
var links = require('./links.js');
var options = require('./options.js');
var tools = require('./tools.js');
var popupFactory = require('./waypoint_popup.js');

var parsedOptions = links.parse(window.location.search);
var viewOptions = L.extend(options.viewDefaults, parsedOptions);

var map = L.map('map', {zoomControl: false}).setView(viewOptions.center, viewOptions.zoom);

var mapbox = L.tileLayer('https://{s}.tiles.mapbox.com/v3/dennisl.4e2aab76/{z}/{x}/{y}.png',
    {attribution: '&copy; <a href="http://mapbox.com/">MapBox</a> &copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'}
    ).addTo(map);


var lrm = L.Routing.control(L.extend({language: viewOptions.language},
                                     L.extend(options.controlDefaults,
                                              theme.options.lrm)
                                    ));
lrm.addTo(map);

// We need to do this the ugly way because of cyclic dependencies...
lrm.getPlan().options.waypointPopup = popupFactory(lrm, theme.options.popup);

var toolsControl = tools.control(lrm, L.extend({ position: 'bottomleft', language: viewOptions.language},
                                               theme.options.tools));
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
