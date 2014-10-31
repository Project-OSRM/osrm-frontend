"use strict";

var PopupFactory = L.Class.extend({
  include: L.Mixin.Events,
  options: {
    removeButtonClass: '',
    uturnButtonClass: ''
  },

  initialize: function(lrm, options) {
    L.setOptions(this, options);
    this._lrm = lrm;
  },

  _updateUTurnIcon: function(button, wp) {
      if (wp.options.allowUTurn)
      {
        L.DomUtil.removeClass(button, 'leaflet-osrm-popup-inactive');
      }
      else
      {
        L.DomUtil.addClass(button, 'leaflet-osrm-popup-inactive');
      }
  },

  createPopup: function(i, name, n) {
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

    popup = L.popup({className: 'leaflet-osrm-waypoint-popup', closeButton: false});
    popup.setContent(container);
    return popup;
  },
});

module.exports = function (lrm, options) {
  var factory = new PopupFactory(lrm, options);
  return function(i, name, n) {
    return factory.createPopup(i, name, n);
  };
};
