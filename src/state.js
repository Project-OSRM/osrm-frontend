var links = require('./links');

var State = L.Class.extend({
  options: { },

  initialize: function(map, lrm_control, tools, default_options) {
    L.setOptions(this, default_options);
    this._lrm = lrm_control;
    this._map = map;
    this._tools = tools;

    this._lrm.on('routeselected', function(e) {
      this.options.alternative = e.route;
    }, this);

    this._lrm.getPlan().on('waypointschanged', function() { this.options.waypoints = this._lrm.getWaypoints(); this.update(); }, this);
    this._map.on('zoomend', function() { this.options.zoom = this._map.getZoom();  this.update(); }, this);
    this._map.on('moveend', function() { this.options.center = this._map.getCenter(); this.update(); }, this);
    this._tools.on('languagechanged', function(e) { this.options.language = e.language; this.reload(); }, this);
    this._tools.on('unitschanged', function(e) { this.options.units = e.unit; this.update(); }, this);
  },

  get: function() {
    return options;
  },

  set: function(options) {
    L.setOptions(this, options);
  },

  reload: function() {
    this.update();
    window.location.reload();
  },

  // Update browser url
  update: function() {
    var hash = links.format(window.location.href, this.options).split('?');
    var baseURL = hash[0];
    var newParms = hash[1];
    var newURL = baseURL.concat('?').concat(newParms);
    window.location.hash = newParms;
    history.replaceState({}, 'Project OSRM Demo', newURL);
  },
});

module.exports = function(map, lrm_control, tools, default_options) {
  return new State(map, lrm_control, tools, default_options);
};
