'use strict';

var MarkerFactory = L.Class.extend({
  include: L.Mixin.Events,
  options: {
    removeButtonClass: '',
    uturnButtonClass: '',
    markerOptions: {}
  },

  initialize: function(lrm, options) {
    L.setOptions(this, options);
    this._lrm = lrm;
  },

  _updateUTurnIcon: function(button, wp) {
    if (wp.options.allowUTurn) {
      L.DomUtil.removeClass(button, 'leaflet-osrm-popup-inactive');
    } else {
      L.DomUtil.addClass(button, 'leaflet-osrm-popup-inactive');
    }
  },

  _createPopup: function(i) {
    var container = L.DomUtil.create('div', 'leaflet-osrm-popup-container'),
      removeButton = L.DomUtil.create('span', this.options.removeButtonClass, container),
      uturnButton = L.DomUtil.create('span', this.options.uturnButtonClass, container),
      popup;
    L.DomEvent.addListener(removeButton, 'click', function() {
      this._lrm.spliceWaypoints(i, 1);
    }, this);

    L.DomEvent.addListener(uturnButton, 'click', function() {
      var wp = this._lrm.getPlan().getWaypoints()[i];
      wp.options.allowUTurn = wp.options.allowUTurn ? false : true;
      this._updateUTurnIcon(uturnButton, wp);
    }, this);
    this._updateUTurnIcon(uturnButton, this._lrm.getPlan().getWaypoints()[i]);
    popup = L.popup({
      className: 'leaflet-osrm-waypoint-popup',
      closeButton: false
    });
    popup.setContent(container);
    return popup;
  },

  createMarker: function(i, wp, n) {
    var label = String.fromCharCode(65 + i),
      options = L.extend({
        draggable: true
      }, this.options.markerOptions),
      marker = L.marker(wp.latLng, options);
    marker.bindLabel(label, {
      direction: 'auto',
      noHide: true,
      className: 'leaflet-osrm-waypoint-label'
    });
    marker.bindPopup(this._createPopup(i));
    return marker;
  }
});

module.exports = function(lrm, options) {
  var factory = new MarkerFactory(lrm, options);
  return function(i, wp, n) {
    return factory.createMarker(i, wp, n);
  };
};