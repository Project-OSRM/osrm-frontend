'use strict';

var L = require('leaflet');
var Geocoder = require('leaflet-control-geocoder');
var LRM = require('leaflet-routing-machine');
var locate = require('leaflet.locatecontrol');
var options = require('./lrm_options');
var links = require('./links');
var mapView = require('./leaflet_options');
var tools = require('./tools');
var mapLayer = mapView.layer;
var overlay = mapView.overlay;
var markerFactory = require('./marker');
var parsedOptions = links.parse(window.location.href);
var viewOptions = L.extend(mapView.defaultView, parsedOptions);
var ls = require('local-storage');
var mapboxRouter = require('lrm-mapbox');

var baselayer = ls.get('layer') ? mapView.layer[0][ls.get('layer')] : mapView.layer[0]['Mapbox Streets'];
if (ls.get('getOverlay')==true) {
  var map = L.map('map', {
    zoomControl: true,
    dragging: true,
    layers: [baselayer, overlay['Small Components']],
    maxZoom: 18
  }).setView(viewOptions.center, viewOptions.zoom);

} else {
  var map = L.map('map', {
    zoomControl: true,
    dragging: true,
    layers: baselayer,
    maxZoom: 18
  }).setView(viewOptions.center, viewOptions.zoom);
}

// Pass basemap layers
mapLayer = mapLayer.reduce(function(title, layer) {
  title[layer.label] = L.tileLayer(layer.tileLayer, {
    id: layer.label
  });
  return title;
});

/* Leaflet Controls */
L.control.layers(mapLayer, overlay, {
  position: 'bottomleft'
}).addTo(map);

L.control.scale().addTo(map);

/* Store User preferences */
// store baselayer changes
map.on('baselayerchange', function(e) {
  ls.set('layer', e.name);
});

// store overlay add or remove
map.on('overlayadd', function(e) {
  ls.set('getOverlay', true);
});

map.on('overlayremove', function(e) {
  ls.set('getOverlay', false);
});


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
  }
  if (i === n - 1) {
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
  routeDragInterval: options.lrm.routeDragInterval,
  addWaypoints: true,
  waypointMode: 'snap',
  position: 'topright',
  useZoomParameter: options.lrm.useZoomParameter,
  reverseWaypoints: true,
  dragStyles: options.lrm.dragStyles,
  geocodersClassName: options.lrm.geocodersClassName,

  // adds the "zoom to" button next to place name in geocoder
  createGeocoderElement: function(waypoint, length, options) {
    var elem = L.Routing.geocoderElement.apply(this, arguments);
    var latLng = elem._waypoint.latLng;
    if (latLng) {
      var container = elem._element.container;
      var zoomToBtn = L.DomUtil.create('span', 'osrm-zoom-to', container);
      L.DomEvent.addListener(zoomToBtn, 'click', function() {
        var point = elem._waypoint.latLng;
        map.setView(point, 22);
      });
    }
    return elem;
  },
  geocoderPlaceholder: function(i, n) {
    var startend = ['Start - press enter to drop marker', 'End - press enter to drop marker'];
    var via = ['Via point - press enter to drop marker'];
    if (i === 0) {
      return startend[0];
    }
    if (i === (n - 1)) {
      return startend[1];
    } else {
      return via;
    }
  }
});

plan.on('waypointgeocoded', function(e) {
  if (plan._waypoints.filter(function(wp) { return !!wp.latLng; }).length < 2) {
    map.panTo(e.waypoint.latLng);
  }
});

// add marker labels
plan.createMarker = markerFactory(plan, options.popup);
var control = L.Routing.control({
  router: new L.Routing.Mapbox('pk.eyJ1Ijoic2FuamF5YiIsImEiOiJjaWZzMjMyMGgxNnJrc3BrcjZhM2ZiZHR4In0.0pFYU5tHm1tuFYhTAva1SA'),
  plan: plan,
  routeWhileDragging: options.lrm.routeWhileDragging,
  lineOptions: options.lrm.lineOptions,
  altLineOptions: options.lrm.altLineOptions,
  summaryTemplate: options.lrm.summaryTemplate,
  containerClassName: options.lrm.containerClassName,
  alternativeClassName: options.lrm.alternativeClassName,
  stepClassName: options.lrm.stepClassName,
  language: viewOptions.language,
  showAlternatives: options.lrm.showAlternatives,
  units: viewOptions.units,
  serviceUrl: mapView.services[0].path,
  useZoomParameter: options.lrm.useZoomParameter,
  routeDragInterval: options.lrm.routeDragInterval
}).addTo(map);
var toolsControl = tools.control(control, L.extend({
  position: 'bottomleft',
  language: mapView.language
}, options.tools)).addTo(map);
if (viewOptions.waypoints.length < 1) {}
// set waypoints from hash values
if (viewOptions.waypoints.length > 1) {
  control.setWaypoints(viewOptions.waypoints);
}

//if there is a routing error, zoom to extent of waypoints
control.on('routingerror', function(err) {
  var waypoints = err.target._plan._waypoints;
  var firstWaypoint = waypoints[0].latLng;
  var lastWaypoint = waypoints[waypoints.length - 1].latLng;
  map.fitBounds([firstWaypoint, lastWaypoint]);
});

// add onClick event
var mapClick = map.on('click', mapChange);
plan.on('waypointschanged', updateHash);
// add onZoom event
map.on('zoomend', mapZoom);
map.on('moveend', mapMove);

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
  }
}

function mapZoom(e) {
  var linkOptions = toolsControl._getLinkOptions();
  var updateZoom = links.format(window.location.href, linkOptions);
  history.replaceState({}, 'Project OSRM Demo', updateZoom);
}

function mapMove(e) {
  var linkOptions = toolsControl._getLinkOptions();
  var updateCenter = links.format(window.location.href, linkOptions);
  history.replaceState({}, 'Project OSRM Demo', updateCenter);
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
  history.replaceState({}, 'Directions', newURL);
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
  } else {
    directions[0].style.display = 'block';
    directions[1].style.display = 'none';
  }
});

L.control.locate({
  follow: false,
  setView: true,
  remainActive: false,
  keepCurrentZoomLevel: true,
  stopFollowingOnDrag: false,
  onLocationError: function(err) {
    alert(err.message)
  },
  onLocationOutsideMapBounds: function(context) {
    alert(context.options.strings.outsideMapBoundsMsg);
  },
  showPopup: false,
  locateOptions: {}
}).addTo(map);
