'use strict';

var L = require('leaflet');
var links = require('./links');

var State = L.Class.extend({
  options: { },

  initialize: function(map, lrm_control, tools, default_options) {
    this._lrm = lrm_control;
    this._map = map;
    this._tools = tools;

    this.set(default_options);

    this._lrm.on('routeselected', function(e) {
      this.options.alternative = e.route.routesIndex;
    }, this);

    this._lrm.getPlan().on('waypointschanged', function() { this.options.waypoints = this._lrm.getWaypoints(); this.update(); }.bind(this));
    this._map.on('zoomend', function() { this.options.zoom = this._map.getZoom();  this.update(); }.bind(this));
    this._map.on('moveend', function() { this.options.center = this._map.getCenter(); this.update(); }.bind(this));
    this._tools.on('languagechanged', function(e) { this.options.language = e.language; this.reload(); }.bind(this));
    this._tools.on('unitschanged', function(e) { this.options.units = e.unit; this.update(); }.bind(this));
  },

  get: function() {
    return this.options;
  },

  set: function(options) {
    L.setOptions(this, options);
    this._lrm.setWaypoints(this.options.waypoints);
    this._map.setView(this.options.center, this.options.zoom);
  },

  reload: function() {
    this.update();
    window.location.reload();
  },

  // Update browser url
  update: function() {
    var baseURL = window.location.href.split('?')[0];
    var newParms = links.format(this.options);
    var newURL = baseURL.concat('?').concat(newParms);
    window.location.hash = newParms;
    history.replaceState({}, 'Project OSRM Demo', newURL);
  },
});

module.exports = function(map, lrm_control, tools, default_options) {
  return new State(map, lrm_control, tools, default_options);
};
