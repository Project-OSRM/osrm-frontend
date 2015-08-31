'use strict';

var Geocoder = require('leaflet-control-geocoder');
var LRM = require('leaflet-routing-machine');
var options = require('./src/lrm_options');
var links = require('./src/links');
var mapView = require('./src/leaflet_options');
var tools = require('./src/tools');
var mapLayer = mapView.layer;
var overlay = mapView.overlay;
var markerFactory = require('./src/marker');
var locate = require('leaflet.locatecontrol')

var parsedOptions = links.parse(window.location.href);
var viewOptions = L.extend(mapView.defaultView, parsedOptions);

// Pass basemap layers
mapLayer = mapLayer.reduce(function(title, layer) {
  title[layer.label] = L.tileLayer(layer.tileLayer, {id: layer.label});
  return title;
});

/* Add the map class */
var map = L.map('map', {
  zoomControl: true,
  dragging: true,
  layers: mapView.defaultView.layer,
  maxZoom: 18
}).setView(viewOptions.center, viewOptions.zoom);


/* Leaflet Controls */
L.control.layers(mapLayer, overlay, {
    position: 'bottomleft',
  }).addTo(map);

L.control.scale().addTo(map);


/* OSRM setup */
var ReversablePlan = L.Routing.Plan.extend({
  createGeocoders: function() {
    var container = L.Routing.Plan.prototype.createGeocoders.call(this);
    return container;
  }
});


/* Setup markers */
function makeIcon(i, n) {
  var url = 'images/marker-via-icon-2x.png';
  var markerList = ['images/marker-start-icon-2x.png', 'images/marker-end-icon-2x.png'];
  if (i === 0) {
    return L.icon({
      iconUrl: markerList[0],
      iconSize: [20, 56],
      iconAnchor: [10, 28]
    });
  } if (i === n - 1) {
    return L.icon({
      iconUrl: markerList[1],
      iconSize: [20, 56],
      iconAnchor: [10, 28]
    });
  } else {
    return L.icon({
      iconUrl: url,
      iconSize: [20, 56],
      iconAnchor: [10, 28]
    });
  }
}

var plan = new ReversablePlan([], {
  geocoder: Geocoder.nominatim(),
  routeWhileDragging: true,
  createMarker: function(i, wp, n) {
    var options = {
      draggable: this.draggableWaypoints,
      icon: makeIcon(i, n)
    };
    var marker = L.marker(wp.latLng, options);
    marker.on('click', function() {
        plan.spliceWaypoints(i, 1);
    });
    return marker;
  },
  routeDragInterval: 100,
  addWaypoints: true,
  waypointMode: 'snap',
  position: 'topright',
  useZoomParameter: true,
  reverseWaypoints: true,
  dragStyles: options.lrm.dragStyles,
  geocodersClassName: options.lrm.geocodersClassName
});

// add marker labels
plan.createMarker = markerFactory(plan, options.popup);

var control = L.Routing.control({
  plan: plan,
  routeWhileDragging: true,
  lineOptions: options.lrm.lineOptions,
  altLineOptions: options.lrm.altLineOptions,
  summaryTemplate: options.lrm.summaryTemplate,
  containerClassName: options.lrm.containerClassName,
  alternativeClassName: options.lrm.alternativeClassName,
  stepClassName: options.lrm.stepClassName,
  language: viewOptions.language,
  units: viewOptions.units,
  serviceUrl: mapView.services[0].path
}).addTo(map);

var toolsControl = tools.control(control, L.extend({
  position: 'bottomleft',
  language: mapView.language
 }, options.tools)).addTo(map);
if (viewOptions.waypoints.length < 1) {
  //control.setWaypoints(viewOptions.waypoints);
}
// set waypoints from hash values
if (viewOptions.waypoints.length > 1) {
  control.setWaypoints(viewOptions.waypoints);
}
// add onClick option
var mapClick = map.on('click', mapChange);
plan.on('waypointschanged', updateHash);

function mapChange(e) {
  var length = control.getWaypoints().filter(function(pnt) {
    return pnt.latLng;
  });
  length = length.length;
  if (!length) {
    control.spliceWaypoints(0, 1, e.latlng);
  } else {
    if (length === 1) length = length + 1;
    control.spliceWaypoints(length - 1, 1, e.latlng);
    //updateSearch();
  }
  //e.preventDefault();
}

// Update browser url
function updateHash(e) {
  var length = control.getWaypoints().filter(function(pnt) {
    return pnt.latLng;
  }).length;
  var linkOptions = toolsControl._getLinkOptions();
  linkOptions.waypoints = plan._waypoints;
  var hash = links.format(window.location.href, linkOptions).split('?');
  var baseURL = window.location.hash = hash[0];
  var newBaseURL = baseURL.concat('?');
  var newParms = window.location.hash = hash[1];
  var oldURL = window.location;
  var newURL = newBaseURL.concat(newParms);
  history.replaceState( {} , 'Directions', newURL);
}

// Update browser url
function updateSearch(e) {
  var length = control.getWaypoints().filter(function(pnt) {
    return pnt.latLng;
  }).length;
  var linkOptions = toolsControl._getLinkOptions();
  linkOptions.waypoints = plan._waypoints;
  var search = links.format(window.location.href, linkOptions).split('?');
  window.location.search = search[1];
}


// User selected routes
control.on('alternateChosen', function(e) {
  var directions = document.querySelectorAll('.leaflet-routing-alt');
  if (directions[0].style.display != 'none') {
    directions[0].style.display = 'none';
    directions[1].style.display = 'block';
  }
  else {
    directions[0].style.display = 'block';
    directions[1].style.display = 'none';
  }
});

L.control.locate({
    follow: false,
    setView: true,
    keepCurrentZoomLevel: false,
    stopFollowingOnDrag: false,
    onLocationError: function(err) {alert(err.message)},
    onLocationOutsideMapBounds:  function(context) { 
      alert(context.options.strings.outsideMapBoundsMsg);
    },
    showPopup: false,
    locateOptions: {}
}).addTo(map);
