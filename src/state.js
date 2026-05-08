"use strict";

var L = require("leaflet");
var links = require("./links");

var State = L.Class.extend({
  options: {},

  initialize: function (
    map,
    lrm_control,
    tools,
    modeSelector,
    default_options,
  ) {
    this._lrm = lrm_control;
    this._map = map;
    this._tools = tools;
    this._modeSelector = modeSelector;

    this.set(default_options);

    this._lrm.on(
      "routeselected",
      function (e) {
        this.options.alternative = e.route.routesIndex;
      },
      this,
    );

    this._lrm.getPlan().on(
      "waypointschanged",
      function () {
        this.options.waypoints = this._lrm.getWaypoints();
        this.update();
      }.bind(this),
    );
    this._map.on(
      "zoomend",
      function () {
        this.options.zoom = this._map.getZoom();
        this.update();
      }.bind(this),
    );
    this._map.on(
      "moveend",
      function () {
        this.options.center = this._map.getCenter();
        this.update();
      }.bind(this),
    );
    this._tools.on(
      "languagechanged",
      function (e) {
        this.options.language = e.language;
        // Update URL without reloading the page
        this.update();
        // Update the tools localization and UI
        var localization = require("./localization");
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
          plan._geocoderElems.forEach(function (geocoderElem, index) {
            if (
              geocoderElem &&
              geocoderElem._element &&
              geocoderElem._element.input
            ) {
              if (geocoderElem.options) {
                geocoderElem.options.language = e.language;
              }
              geocoderElem._element.input.setAttribute(
                "placeholder",
                plan.options.geocoderPlaceholder(
                  index,
                  plan._geocoderElems.length,
                  geocoderElem,
                ),
              );
            }
          });
        }

        // Re-render directions with new language if routes exist.
        // lrmControl extends L.Routing.Itinerary directly, so _itineraryBuilder,
        // _routes, and setAlternatives are properties of lrmControl itself.
        if (this._lrm && this._lrm._routes && this._lrm._routes.length > 0) {
          try {
            var ItineraryBuilderClass = require("./itinerary_builder")(
              e.language,
            );
            var newItineraryBuilder = new ItineraryBuilderClass();
            this._lrm._itineraryBuilder = newItineraryBuilder;
            this._lrm.setAlternatives(this._lrm._routes);
          } catch (err) {
            console.error("Error updating itinerary on language change:", err);
          }
        }
      }.bind(this),
    );
    this._tools.on(
      "unitschanged",
      function (e) {
        this.options.units = e.unit;
        this.update();
        // Update routing control units and re-render itinerary/directions
        if (this._lrm) {
          // Update control options
          this._lrm.options = this._lrm.options || {};
          this._lrm.options.units = e.unit;
          // Update formatter used by itinerary (if present)
          if (
            this._lrm._formatter &&
            typeof this._lrm._formatter === "object"
          ) {
            this._lrm._formatter.options = this._lrm._formatter.options || {};
            this._lrm._formatter.options.units = e.unit;
          }
          try {
            if (this._lrm._routes) {
              // Re-render itinerary and alternatives using updated formatter
              this._lrm.setAlternatives(this._lrm._routes);
            }
          } catch (err) {
            console.error("Error updating itinerary on units change:", err);
          }
        }
      }.bind(this),
    );
  },

  get: function () {
    return this.options;
  },

  set: function (options) {
    L.setOptions(this, options);
    this._lrm.setWaypoints(this.options.waypoints);
    this._map.setView(this.options.center, this.options.zoom);
  },

  reload: function () {
    this.update();
    window.location.reload();
  },

  // Update browser url
  update: function () {
    var baseURL = window.location.href.split("?")[0];
    var newParms = links.format(this.options);
    var newURL = baseURL.concat("?").concat(newParms);
    window.location.hash = newParms;
    history.replaceState({}, "Project OSRM Demo", newURL);
  },
});

module.exports = function (
  map,
  lrm_control,
  tools,
  modeSelector,
  default_options,
) {
  return new State(map, lrm_control, tools, modeSelector, default_options);
};
