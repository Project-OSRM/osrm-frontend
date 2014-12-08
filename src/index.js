"use strict";

var theme = require('./directions_theme.js');
var links = require('./links.js');
var options = require('./options.js');
var tools = require('./tools.js');
var markerFactory = require('./markers.js');
var hideButton = require('./hide_button.js');

var parsedOptions = links.parse(window.location.search);
var viewOptions = L.extend(options.viewDefaults, parsedOptions);

var map = L.map('map', {
  zoomControl: false,
  layers: [options.layers[viewOptions.layer]]
}).setView(viewOptions.center, viewOptions.zoom);

/*
 * Setup controls
 */
var lrm = L.Routing.control(L.extend({language: viewOptions.language,
                                      units: viewOptions.units,
                                      serviceURL: options.services[viewOptions.service],
                                     },
                                     L.extend(options.controlDefaults,
                                              theme.options.lrm)
                                    )).addTo(map);
// We need to do this the ugly way because of cyclic dependencies...
lrm.getPlan().options.createMarker = markerFactory(lrm, theme.options.popup);
tools.control(lrm, L.extend({
                              position: 'bottomleft',
                              language: viewOptions.language
                            },
                            theme.options.tools)).addTo(map);
L.control.layers(options.layers, {}, {position: 'bottomleft'}).addTo(map);
L.control.scale({position: 'bottomleft'}).addTo(map);

hideButton({
  showFunction: function() { lrm.show(); },
  hideFunction: function() { lrm.hide(); },
  isHidden: function() { return L.DomUtil.hasClass(lrm.getPlan()._geocoderContainer.parentNode, 'leaflet-routing-container-hide'); },
}).addTo(lrm.getPlan()._geocoderContainer);
hideButton({
  showFunction: function() { lrm.show(); },
  hideFunction: function() { lrm.hide(); },
  isHidden: function() { return L.DomUtil.hasClass(lrm.getPlan()._geocoderContainer.parentNode, 'leaflet-routing-container-hide'); },
  border: 'left'
}).addTo(lrm._container);

// Click handler that adds waypoints
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

/*
 * Initial route request
 */
function initialRouteCallback() {
  lrm.off('routeselected', initialRouteCallback);
  lrm.off('routingerror', initialRouteCallback);

  lrm.selectAlternative(viewOptions.alternative);
}

if (viewOptions.alternative) {
  lrm.on('routeselected', initialRouteCallback);
  lrm.on('routingerror', initialRouteCallback);
}

lrm.setWaypoints(viewOptions.waypoints);

