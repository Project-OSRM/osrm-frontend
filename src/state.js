'use strict';

var L = require('leaflet');
var links = require('./links');
var urlState = require('./url_state');

var State = L.Class.extend({
  options: { },

  initialize: function(map, lrm_control, tools, modeSelector, default_options) {
    this._lrm = lrm_control;
    this._map = map;
    this._tools = tools;
    this._modeSelector = modeSelector;

    // When applying history/popstate we temporarily suppress emitting URL updates
    this._suppressHistory = false;

    this.set(default_options);

    this._lrm.getPlan().on('waypointschanged', function() {
      this.options.waypoints = this._lrm.getWaypoints(); this.update({ push: true });
    }.bind(this));
    this._map.on('zoomend', function() {
      this.options.zoom = this._map.getZoom();  this.update(); 
    }.bind(this));
    this._map.on('moveend', function() {
      this.options.center = this._map.getCenter(); this.update(); 
    }.bind(this));
    this._tools.on('languagechanged', function(e) {
      this.options.language = e.language;
      // Update URL without reloading the page (user action -> create history entry)
      this.update({ push: true });
      // Update the tools localization and UI
      var localization = require('./localization');
      var newLocalization = localization.get(e.language);
      var plan = this._lrm.getPlan();
      this._tools.updateLocalization(newLocalization);
      if (this._modeSelector && this._modeSelector.updateLocalization) {
        this._modeSelector.updateLocalization(newLocalization);
      }
      if (plan && plan.options) {
        plan.options.language = e.language;
      }
      if (plan && plan._geocoderElems) {
        plan._geocoderElems.forEach(function(geocoderElem, index) {
          if (geocoderElem && geocoderElem._element && geocoderElem._element.input) {
            if (geocoderElem.options) {
              geocoderElem.options.language = e.language;
            }
            geocoderElem._element.input.setAttribute(
              'placeholder',
              plan.options.geocoderPlaceholder(index, plan._geocoderElems.length, geocoderElem)
            );
          }
        });
      }
      
      // Re-render directions with new language if routes exist.
      // lrmControl extends L.Routing.Itinerary directly, so _itineraryBuilder,
      // _routes, and setAlternatives are properties of lrmControl itself.
      if (this._lrm && this._lrm._routes && this._lrm._routes.length > 0) {
        try {
          var ItineraryBuilderClass = require('./itinerary_builder')(e.language);
          var newItineraryBuilder = new ItineraryBuilderClass();
          this._lrm._itineraryBuilder = newItineraryBuilder;
          this._lrm.setAlternatives(this._lrm._routes);
        } catch (err) {
          console.error('Error updating itinerary on language change:', err);
        }
      }
    }.bind(this));
    this._tools.on('unitschanged', function(e) {
      this.options.units = e.unit;
      this.update({ push: true });
      // Update routing control units and re-render itinerary/directions
      if (this._lrm) {
        // Update control options
        this._lrm.options = this._lrm.options || {};
        this._lrm.options.units = e.unit;
        // Update formatter used by itinerary (if present)
        if (this._lrm._formatter && typeof this._lrm._formatter === 'object') {
          this._lrm._formatter.options = this._lrm._formatter.options || {};
          this._lrm._formatter.options.units = e.unit;
        }
        try {
          if (this._lrm._routes) {
            // Re-render itinerary and alternatives using updated formatter
            this._lrm.setAlternatives(this._lrm._routes);
          }
        } catch (err) {
          console.error('Error updating itinerary on units change:', err);
        }
      }
    }.bind(this));
  },

  get: function() {
    return this.options;
  },

  set: function(options) {
    L.setOptions(this, options);

    // Normalize center to Leaflet LatLng if a plain {lat,lng} object is provided
    if (this.options.center && typeof this.options.center.lat === 'number' && typeof this.options.center.lng === 'number') {
      try {
        this.options.center = L.latLng(this.options.center.lat, this.options.center.lng);
      } catch (err) {
        // ignore if L.latLng not available
      }
    }

    // Normalize waypoints to L.Routing.waypoint where possible
    if (Array.isArray(this.options.waypoints)) {
      var that = this;
      this.options.waypoints = this.options.waypoints.map(function(wp) {
        if (!wp) {
          // preserve empty waypoints in the shape LRM expects when possible
          return (typeof L.Routing !== 'undefined' && typeof L.Routing.waypoint === 'function') ? L.Routing.waypoint(null) : wp;
        }
        // Already a waypoint-like with latLng
        if (wp.latLng) return wp;
        // Plain {lat, lng}
        if (typeof wp.lat === 'number' && typeof wp.lng === 'number') {
          if (typeof L.Routing !== 'undefined' && typeof L.Routing.waypoint === 'function' && typeof L.latLng === 'function') {
            return L.Routing.waypoint(L.latLng(wp.lat, wp.lng));
          }
          return { latLng: { lat: wp.lat, lng: wp.lng } };
        }
        // array form [lat,lng]
        if (Array.isArray(wp) && wp.length >= 2) {
          var lat = parseFloat(wp[0]);
          var lng = parseFloat(wp[1]);
          if (!isNaN(lat) && !isNaN(lng)) {
            if (typeof L.Routing !== 'undefined' && typeof L.Routing.waypoint === 'function' && typeof L.latLng === 'function') {
              return L.Routing.waypoint(L.latLng(lat, lng));
            }
            return { latLng: { lat: lat, lng: lng } };
          }
        }
        return wp;
      });
    }

    // Apply waypoints and view to map/router
    try {
      if (this._lrm && typeof this._lrm.setWaypoints === 'function') {
        this._lrm.setWaypoints(this.options.waypoints);
      }
    } catch (e) {
      console.error('Error setting waypoints:', e);
    }
    if (this.options.center) {
      try {
        this._map.setView(this.options.center, this.options.zoom);
      } catch (e) {
        console.error('Error setting map view:', e);
      }
    }
  },

  reload: function() {
    this.update();
    window.location.reload();
  },

  disableHistory: function() {
    this._suppressHistory = true;
  },

  enableHistory: function() {
    this._suppressHistory = false;
  },

  // Update browser url
  update: function(opts) {
    opts = opts || {};
    // If suppressed (e.g., while applying popstate), do not modify history
    if (this._suppressHistory) return;

    try {
      if (opts.push) {
        urlState.push(this.options);
      } else {
        urlState.replace(this.options);
      }
    } catch (e) {
      // Fallback if urlState is unavailable
      var baseURL = window.location.href.split('?')[0];
      var newParms = links.format(this.options);
      var newURL = baseURL + '?' + newParms;
      try {
        if (opts.push) {
          history.pushState({}, 'Project OSRM Demo', newURL);
        } else {
          history.replaceState({}, 'Project OSRM Demo', newURL);
        }
      } catch (err) {
        // ignore fallback errors
      }
    }
  }
});

module.exports = function(map, lrm_control, tools, modeSelector, default_options) {
  return new State(map, lrm_control, tools, modeSelector, default_options);
};
