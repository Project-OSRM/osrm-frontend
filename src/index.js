'use strict';

var L = require('leaflet');
var routerPatches = require('./router_patches');
var createGeocoder = require('./geocoder');
require('leaflet-control-geocoder');
var geocoderPatches = require('./geocoder_patches');
geocoderPatches();
var LRM = require('leaflet-routing-machine');

// Register app languages that LRM does not have built-in so LRM does not throw
// "No localization for language" when they are selected. We reuse English
// strings because LRM's UI labels (start/end/via placeholders, units) are
// overridden by the app anyway via geocoderPlaceholder and osrm-text-instructions.
// LRM sets L.Routing as a side-effect, so use that to reach its Localization registry.
(function registerMissingLRMLanguages() {
  var lrmLoc = L.Routing && L.Routing.Localization;
  if (!lrmLoc || !lrmLoc['en']) return;
  var englishFallback = lrmLoc['en'];
  ['da', 'fa', 'hu', 'ja', 'vi', 'zh-Hans'].forEach(function(lang) {
    var generalizedCode = /([A-Za-z]+)/.exec(lang)[1];
    if (!lrmLoc[lang] && !lrmLoc[generalizedCode]) {
      lrmLoc[lang] = englishFallback;
    }
  });
}());

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
var initialLayers = require('./initial_layers');
var layerUtils = require('./layer_utils');
require('./polyfill');

var parsedOptions = links.parse(window.location.search.slice(1));
// Merge into a fresh object to avoid mutating leafletOptions.defaultState
var mergedOptions = L.extend({}, leafletOptions.defaultState, parsedOptions);
var language = mergedOptions.language;

// Build and translate services early so modeSelector can use translated labels
var services = leafletOptions.services;
for (var i = 0, len = services.length; i < len; i++) {
  var profileLabelKey = services[i].labelKey || services[i].label;
  services[i].labelKey = profileLabelKey;
  services[i].label = localization.t(language, profileLabelKey) || profileLabelKey;
}
var modeSelector = modeSelectorModule.createModeSelector(localization.get(language), services);

// load only after language was chosen
var ItineraryBuilder = require('./itinerary_builder')(mergedOptions.language);

var mapLayer = leafletOptions.layer;
var overlay = leafletOptions.overlay;

// Track whether the Bike overlay was auto-enabled by profile selection
var bikeOverlayOriginallyActive = false;
var baselayer;
var storedLayerName = ls.get('layer');
if (storedLayerName) {
  baselayer = mapLayer[0][storedLayerName];
} else if (mergedOptions.layer) {
  if (typeof mergedOptions.layer === 'string' && mapLayer && mapLayer[0]) {
    baselayer = mapLayer[0][mergedOptions.layer] || leafletOptions.defaultState.layer;
  } else {
    baselayer = mergedOptions.layer || leafletOptions.defaultState.layer;
  }
} else {
  baselayer = leafletOptions.defaultState.layer;
}

// Determine the initial profile so we can pick the right overlay
var _urlProfile = parsedOptions.profile;
var _savedProfile = ls.get('profile');
var _initProfileIndex;
if (_urlProfile !== undefined && _urlProfile !== null) {
  _initProfileIndex = parseInt(_urlProfile, 10);
} else if (_savedProfile !== null && _savedProfile !== undefined) {
  _initProfileIndex = parseInt(_savedProfile, 10);
} else {
  _initProfileIndex = 0;
}

var _initResult = initialLayers.determineInitialLayers(baselayer, overlay, services, _initProfileIndex, !!ls.get('getOverlay'));
var layers = _initResult.layers;
var bikeOverlayAutoActivated = _initResult.bikeOverlayAutoActivated;
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
// store baselayer changes and update URL/state
map.on('baselayerchange', function(e) {
  layerUtils.handleBaselayerChange(e, ls, state);
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
  waypointNameFallback: createGeocoder.wrappedWaypointNameFallback,
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
  fitSelectedRoutes: false,
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
  serviceUrl: services[0].path,
  useHints: false,
  services: services,
  useZoomParameter: options.lrm.useZoomParameter,
  routeDragInterval: options.lrm.routeDragInterval,
  collapsible: options.lrm.collapsible,
  itineraryBuilder: new ItineraryBuilder()
};
// profile labels already translated earlier


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
if (activeProfileIndex < 0 || activeProfileIndex >= services.length) {
  activeProfileIndex = 0;
}

// Set the initial serviceUrl and profile on controlOptions
controlOptions.serviceUrl = services[activeProfileIndex].path;
controlOptions.profile = services[activeProfileIndex].profile;

var router = (new L.Routing.OSRMv1(controlOptions));
routerPatches.applyPatches(router);

router._convertRouteOriginal = router._convertRoute;
router._convertRoute = function(responseRoute) {
  // monkey-patch L.Routing.OSRMv1 until it's easier to overwrite with a hook
  var resp = this._convertRouteOriginal(responseRoute);

  if (resp.instructions && resp.instructions.length) {
    var i = 0;
    var legCount = responseRoute.legs.length;
    responseRoute.legs.forEach(function(leg, legIndex) {
      leg.steps.forEach(function(step) {
        // Only attach the original OSRM step to an LRM instruction when
        // LRM actually creates an instruction for that maneuver type. This
        // keeps the instruction index aligned with the step index and fixes
        // missing/wrong road names for the foot profile.
        var type = (typeof this._maneuverToInstructionType === 'function') ?
          this._maneuverToInstructionType(step.maneuver, legIndex === legCount - 1) : null;
        if (type && i < resp.instructions.length) {
          // abusing the text property to save the original osrm step
          // for later use in the itinerary builder
          resp.instructions[i].text = step;
          i++;
        }
      }.bind(this));
    }.bind(this));
  }

  return resp;
};
var lrmControl = L.Routing.control(Object.assign(controlOptions, {
  router: router
})).addTo(map);

// Workaround: Leaflet Routing Machine's itinerary adds a 'mousewheel' handler
// that stops propagation in some browsers, which can prevent the directions pane
// from scrolling in Firefox (see https://bugzilla.mozilla.org/show_bug.cgi?id=1942589
// and OSRM issue #195). Disable scroll propagation on the routing container so
// the directions list can be scrolled by the user. Upstream LRM issue: https://github.com/perliedman/leaflet-routing-machine/issues/721
if (L && L.DomEvent && typeof L.DomEvent.disableScrollPropagation === 'function') {
  var routingContainers = document.querySelectorAll('.leaflet-routing-container');
  for (var __i = 0; __i < routingContainers.length; __i++) {
    L.DomEvent.disableScrollPropagation(routingContainers[__i]);
  }
}

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
      routerPatches.setActiveService(router, profileIndex, services);
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
    var selectedProfile = services[profileIndex] && services[profileIndex].profile;
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
var shouldFitRoute = false;
lrmControl.on('routesfound', function(e) {
  var container = document.querySelector('.leaflet-routing-container');
  if (container) {
    container.classList.remove('leaflet-routing-container-hide');
  }
  shouldFitRoute = true;
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
  addWaypoint(e);
});
function addWaypoint(evt) {
  var waypoint = evt && evt.latlng ? evt.latlng : evt;
  var length = lrmControl.getWaypoints().filter(function(pnt) {
    return pnt.latLng;
  });
  length = length.length;

  // If both source and target are set, do not change existing markers by clicking on the map.
  // Any marker should stay where it is unless explicitly removed by clicking directly on it.
  // Allow adding a via-point when Ctrl (or Meta on macOS) is held during the click.
  var modifierPressed = evt && evt.originalEvent && (evt.originalEvent.ctrlKey || evt.originalEvent.metaKey);
  if (length >= 2 && !modifierPressed) {
    return;
  }

  if (length >= 2 && modifierPressed) {
    // Insert a via-point before the last waypoint (the target)
    lrmControl.spliceWaypoints(length - 1, 0, waypoint);
    return;
  }

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
lrmControl.on('routeselected', function(e) {
  if (!shouldFitRoute) return;
  shouldFitRoute = false;

  var route = e.route;
  if (!route || !route.coordinates || route.coordinates.length === 0) return;

  var bounds = L.latLngBounds(route.coordinates);

  var container = document.querySelector('.leaflet-routing-container');
  var paneWidth = 0;
  if (container && !container.classList.contains('leaflet-routing-container-hide')) {
    paneWidth = container.offsetWidth;
  }

  var currentZoom = map.getZoom();
  var fitPadding = 20;
  var paddingOpts = {
    paddingTopLeft: L.point(fitPadding, fitPadding),
    paddingBottomRight: L.point(paneWidth + fitPadding, fitPadding)
  };

  if (currentZoom >= 13) {
    var mapSize = map.getSize();
    var availableWidth = mapSize.x - paneWidth - 2 * fitPadding;
    var availableHeight = mapSize.y - 2 * fitPadding;

    var sw = map.project(bounds.getSouthWest(), currentZoom);
    var ne = map.project(bounds.getNorthEast(), currentZoom);
    var routePixelWidth = Math.abs(ne.x - sw.x);
    var routePixelHeight = Math.abs(sw.y - ne.y);

    if (routePixelWidth <= availableWidth && routePixelHeight <= availableHeight) {
      var center = bounds.getCenter();
      var centerPixel = map.project(center, currentZoom);
      centerPixel.x += paneWidth / 2;
      var newMapCenter = map.unproject(centerPixel, currentZoom);
      map.panTo(newMapCenter);
    } else {
      paddingOpts.maxZoom = currentZoom;
      map.fitBounds(bounds, paddingOpts);
    }
  } else {
    map.fitBounds(bounds, paddingOpts);
  }
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

// Zoom to z14 when the user's location is found, but only if no route is computed.
var createLocationFoundHandler = require('./location_handler');
map.on('locationfound', createLocationFoundHandler(map, lrmControl));

// Mark successful startup so the runtime watchdog does not show the error overlay
window.__osrm_app_loaded = true;
