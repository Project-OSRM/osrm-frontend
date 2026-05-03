'use strict';

var L = require('leaflet');
var routerPatches = require('./router_patches');
var createGeocoder = require('./geocoder');
require('leaflet-control-geocoder');
var geocoderPatches = require('./geocoder_patches');
geocoderPatches();
var LRM = require('leaflet-routing-machine');
var modeSelectorModule = require('./mode_selector');
// leaflet.locatecontrol@0.89 UMD has a bug: after the CJS IIFE it tries
// `window.L.Control.Locate.locate` but never sets L.Control.Locate in the
// CJS path, causing a crash at bundle load time. Pre-initialising the
// namespace here prevents the crash; we then call locate.locate() directly.
L.Control.Locate = L.Control.Locate || {};
var locate = require('leaflet.locatecontrol');
var options = require('./lrm_options');
var links = require('./links');
var leafletOptions = require('./leaflet_options');
var ls = require('local-storage');
var tools = require('./tools');
var state = require('./state');
var localization = require('./localization');
require('./polyfill');

var parsedOptions = links.parse(window.location.search.slice(1));
var mergedOptions = L.extend(leafletOptions.defaultState, parsedOptions);
var language = mergedOptions.language;

// Create mode selector early so it can be injected when geocoders are created
var modeSelector = modeSelectorModule.createModeSelector(localization.get(language), leafletOptions.services);

// load only after language was chosen
var ItineraryBuilder = require('./itinerary_builder')(mergedOptions.language);

var mapLayer = leafletOptions.layer;
var overlay = leafletOptions.overlay;

// Track whether the Bike overlay was auto-enabled by profile selection
var bikeOverlayAutoActivated = false;
var bikeOverlayOriginallyActive = false;
var baselayer = ls.get('layer') ? mapLayer[0][ls.get('layer')] : leafletOptions.defaultState.layer;
var layers = ls.get('getOverlay') && [baselayer, overlay['Small Components']] || baselayer;
var map = L.map('map', {
  zoomControl: true,
  dragging: true,
  layers: layers,
  maxZoom: 18
}).setView(mergedOptions.center, mergedOptions.zoom);

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

var scaleControl = L.control.scale({
  position: 'bottomright',
  metric: mergedOptions.units === 'metric' || mergedOptions.units === undefined,
  imperial: mergedOptions.units === 'imperial'
}).addTo(map);

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
    // Inject mode selector after geocoders are created
    if (modeSelector && modeSelector.container) {
      var buttons = container.querySelector('button');
      if (buttons && buttons.parentNode === container) {
        container.insertBefore(modeSelector.container, buttons);
      } else {
        container.appendChild(modeSelector.container);
      }
    }
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
  geocoder: createGeocoder.coordPreserving(leafletOptions.nominatim && leafletOptions.nominatim.path),
  language: mergedOptions.language,
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
  geocoderPlaceholder: function(i, n, geocoderElement) {
    var activeLanguage = geocoderElement && geocoderElement.options ? geocoderElement.options.language : mergedOptions.language;
    var startend = [localization.t(activeLanguage, 'Start - press enter to drop marker'), localization.t(activeLanguage, 'End - press enter to drop marker')];
    var via = [localization.t(activeLanguage, 'Via point - press enter to drop marker')];
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

// add marker labels
var controlOptions = {
  plan: plan,
  routeWhileDragging: options.lrm.routeWhileDragging,
  lineOptions: options.lrm.lineOptions,
  altLineOptions: options.lrm.altLineOptions,
  summaryTemplate: options.lrm.summaryTemplate,
  containerClassName: options.lrm.containerClassName,
  alternativeClassName: options.lrm.alternativeClassName,
  stepClassName: options.lrm.stepClassName,
  language: mergedOptions.language, // we are injecting own translations via osrm-text-instructions
  showAlternatives: options.lrm.showAlternatives,
  units: mergedOptions.units,
  serviceUrl: leafletOptions.services[0].path,
  useHints: false,
  services: leafletOptions.services,
  useZoomParameter: options.lrm.useZoomParameter,
  routeDragInterval: options.lrm.routeDragInterval,
  collapsible: options.lrm.collapsible,
  itineraryBuilder: new ItineraryBuilder()
};
// translate profile names
for (var profile = 0, len = controlOptions.services.length; profile < len; profile++) {
  var profileLabelKey = controlOptions.services[profile].labelKey || controlOptions.services[profile].label;
  controlOptions.services[profile].labelKey = profileLabelKey;
  controlOptions.services[profile].label = localization.t(language, profileLabelKey) || profileLabelKey;
}

// Load and set initial profile BEFORE creating router and lrmControl
// This ensures the router uses the correct serviceUrl when calculating initial routes
var urlProfile = mergedOptions.profile;
var savedProfile = ls.get('profile');
var activeProfileIndex;

if (urlProfile !== undefined && urlProfile !== null) {
  activeProfileIndex = parseInt(urlProfile, 10);
} else if (savedProfile !== null && savedProfile !== undefined) {
  activeProfileIndex = parseInt(savedProfile, 10);
} else {
  activeProfileIndex = 0;
}

// Ensure valid profile index
if (activeProfileIndex < 0 || activeProfileIndex >= leafletOptions.services.length) {
  activeProfileIndex = 0;
}

// Set the initial serviceUrl and profile on controlOptions
controlOptions.serviceUrl = leafletOptions.services[activeProfileIndex].path;
controlOptions.profile = leafletOptions.services[activeProfileIndex].profile;

var router = (new L.Routing.OSRMv1(controlOptions));
routerPatches.applyPatches(router);

router._convertRouteOriginal = router._convertRoute;
router._convertRoute = function(responseRoute) {
  // monkey-patch L.Routing.OSRMv1 until it's easier to overwrite with a hook
  var resp = this._convertRouteOriginal(responseRoute);

  if (resp.instructions && resp.instructions.length) {
    var i = 0;
    responseRoute.legs.forEach(function(leg) {
      leg.steps.forEach(function(step) {
        // abusing the text property to save the original osrm step
        // for later use in the itnerary builder
        resp.instructions[i].text = step;
        i++;
      });
    });
  };

  return resp;
};
var lrmControl = L.Routing.control(Object.assign(controlOptions, {
  router: router
})).addTo(map);
var toolsControl = tools.control(localization.get(mergedOptions.language), localization.getLanguages(), Object.assign({}, options.tools, { initialUnits: mergedOptions.units })).addTo(map);

var state = state(map, lrmControl, toolsControl, modeSelector, mergedOptions);

// Listen for unit changes from tools and update scale and routing control
if (toolsControl && toolsControl.on) {
  toolsControl.on('unitschanged', function(e) {
    try {
      if (lrmControl) {
        lrmControl.options = lrmControl.options || {};
        lrmControl.options.units = e.unit;
        if (lrmControl._formatter && typeof lrmControl._formatter === 'object') {
          lrmControl._formatter.options = lrmControl._formatter.options || {};
          lrmControl._formatter.options.units = e.unit;
        }
        if (lrmControl._routes) {
          lrmControl.setAlternatives(lrmControl._routes);
        }
      }
      if (typeof scaleControl !== 'undefined' && scaleControl) {
        map.removeControl(scaleControl);
      }
      scaleControl = L.control.scale({
        position: 'bottomright',
        metric: e.unit === 'metric',
        imperial: e.unit === 'imperial'
      }).addTo(map);
    } catch (err) {
      console.error('Error updating scale control or routing units:', err);
    }
  });
}

// Profile switching logic
(function initializeProfileSelection() {
  // Set initial profile on modeSelector for UI sync
  if (modeSelector && modeSelector.select) {
    modeSelector.select.value = activeProfileIndex;
  }
  
  // Also update the state object so profile is preserved on language change
  state.options.profile = activeProfileIndex;
  
  // Listen for profile changes
  if (modeSelector && modeSelector.select) {
    function clearProfileSelectorSelection(select) {
      window.setTimeout(function() {
        select.blur();
        if (window.getSelection) {
          window.getSelection().removeAllRanges();
        }
      }, 0);
    }

    L.DomEvent.on(modeSelector.select, 'change', function(event) {
      var profileIndex = parseInt(event.target.value, 10);
      clearProfileSelectorSelection(event.target);
      routerPatches.setActiveService(router, profileIndex, leafletOptions.services);
      ls.set('profile', profileIndex);
      
      // Also update the state object so profile is preserved on language change
      state.options.profile = profileIndex;
      
      // Update URL to include profile parameter - reparse current URL and update profile
      var currentParams = links.parse(window.location.search.slice(1));
      currentParams.profile = profileIndex;
      var newUrl = '?' + links.format(currentParams);
      window.history.replaceState({}, '', newUrl);
      
      // Trigger re-route with current waypoints if they exist
      var waypoints = lrmControl.getWaypoints();
      var validWaypoints = waypoints.filter(function(wp) {
        return wp && wp.latLng;
      });
      if (validWaypoints.length >= 2) {
        // Clear existing routes before computing new ones
        lrmControl._routes = [];
        if (lrmControl._selectedRoute !== undefined && lrmControl._line) {
          lrmControl._map.removeLayer(lrmControl._line);
          lrmControl._line = null;
        }
        lrmControl._selectedRoute = undefined;
        if (lrmControl._itinerary) {
          lrmControl._itinerary._routes = [];
          lrmControl._itinerary._updateSummary();
        }
        // Now compute the new route with the new profile
        lrmControl.route();
      }
    });

  }
}());

// Auto-toggle Bike overlay when profile selection changes
if (modeSelector && modeSelector.select) {
  L.DomEvent.on(modeSelector.select, 'change', function(event) {
    var profileIndex = parseInt(event.target.value, 10);
    var selectedProfile = leafletOptions.services[profileIndex] && leafletOptions.services[profileIndex].profile;
    var bikeLayer = overlay && overlay['Bike'];
    if (!bikeLayer) return;

    if (selectedProfile === 'bike') {
      if (map.hasLayer(bikeLayer)) {
        bikeOverlayOriginallyActive = true;
        bikeOverlayAutoActivated = false;
      } else {
        bikeOverlayOriginallyActive = false;
        map.addLayer(bikeLayer);
        bikeOverlayAutoActivated = true;
      }
    } else {
      if (bikeOverlayAutoActivated) {
        if (map.hasLayer(bikeLayer) && !bikeOverlayOriginallyActive) {
          map.removeLayer(bikeLayer);
        }
        bikeOverlayAutoActivated = false;
        bikeOverlayOriginallyActive = false;
      }
    }
  });
}

// Hide directions pane by default
var routingContainer = document.querySelector('.leaflet-routing-container');
if (routingContainer) {
  routingContainer.classList.add('leaflet-routing-container-hide');
}

// Show pane when route is computed
lrmControl.on('routesfound', function(e) {
  var container = document.querySelector('.leaflet-routing-container');
  if (container) {
    container.classList.remove('leaflet-routing-container-hide');
  }
});

plan.on('waypointgeocoded', function(e) {
  if (plan._waypoints.filter(function(wp) {
    return !!wp.latLng; 
  }).length < 2) {
    map.panTo(e.waypoint.latLng);
  }
});

// If dst/src address params were passed and no loc= waypoints exist, geocode them now.
(function applyAddressParams() {
  var hasLocWaypoints = mergedOptions.waypoints && mergedOptions.waypoints.some(function(wp) {
    return wp && wp.latLng;
  });
  if (hasLocWaypoints) return;

  var srcAddr = mergedOptions.originAddress;
  var dstAddr = mergedOptions.destinationAddress;
  if (!srcAddr && !dstAddr) return;

  var geocoder = createGeocoder.coordPreserving();

  function geocodeAddress(addr, cb) {
    if (!addr) {
      cb(null);
      return;
    }
    geocoder.geocode(addr, function(results) {
      cb(results && results.length > 0 ? results[0] : null);
    });
  }

  geocodeAddress(srcAddr, function(srcResult) {
    geocodeAddress(dstAddr, function(dstResult) {
      var origin = srcResult
        ? L.Routing.waypoint(srcResult.center, srcResult.name)
        : L.Routing.waypoint(null, srcAddr || '');
      var destination = dstResult
        ? L.Routing.waypoint(dstResult.center, dstResult.name)
        : L.Routing.waypoint(null, dstAddr || '');
      lrmControl.setWaypoints([origin, destination]);
    });
  });
}());

// add onClick event
map.on('click', function (e) {
  addWaypoint(e.latlng);
});
function addWaypoint(waypoint) {
  var length = lrmControl.getWaypoints().filter(function(pnt) {
    return pnt.latLng;
  });
  length = length.length;
  if (!length) {
    lrmControl.spliceWaypoints(0, 1, waypoint);
  } else {
    if (length === 1) length = length + 1;
    lrmControl.spliceWaypoints(length - 1, 1, waypoint);
  }
}

// User selected routes
lrmControl.on('alternateChosen', function(e) {
  var directions = document.querySelectorAll('.leaflet-routing-alt');
  if (directions[0].style.display != 'none') {
    directions[0].style.display = 'none';
    directions[1].style.display = 'block';
  } else {
    directions[0].style.display = 'block';
    directions[1].style.display = 'none';
  }
});

// Route export
lrmControl.on('routeselected', function(e) {
  var route = e.route || {};
  var routeGeoJSON = {
    type: 'Feature',
    properties: {
      name: route.name,
      copyright: {
        author: 'OpenStreetMap contributors',
        license: 'http://www.openstreetmap.org/copyright'
      },
      link: {
        href: window.document.location.href,
        text: window.document.title
      },
      time: (new Date()).toISOString()
    },
    geometry: {
      type: 'LineString',
      coordinates: (route.coordinates || []).map(function (coordinate) {
        return [coordinate.lng, coordinate.lat];
      })
    }
  };
  toolsControl.setRouteGeoJSON(routeGeoJSON);
});
plan.on('waypointschanged', function(e) {
  var validCount = e.waypoints ? e.waypoints.filter(function(wp) {
    return !!wp.latLng;
  }).length : 0;
  if (validCount < 2) {
    toolsControl.setRouteGeoJSON(null);
    var container = document.querySelector('.leaflet-routing-container');
    if (container) {
      container.classList.add('leaflet-routing-container-hide');
    }
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
