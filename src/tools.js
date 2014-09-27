"use strict";

var links = require('./links.js');

var Control = L.Control.extend({
  include: L.Mixin.Events,
  options: {
    linkButtonClass: ""
  },

  initialize: function(lrm, options) {
    L.setOptions(this, options);
    this._lrm = lrm;
  },

  onAdd: function() {
    var linkContainer;

    this._container = L.DomUtil.create('div', 'leaflet-osrm-tools-container leaflet-bar');
    L.DomEvent.disableClickPropagation(this._container);

    linkContainer = L.DomUtil.create('div', 'leaflet-osrm-tools-link', this._container);
    this._linkButton = L.DomUtil.create('span', this.options.linkButtonClass, linkContainer);
    this._linkButton.title = "Link";
    L.DomEvent.on(this._linkButton, 'click', this._createLink, this);

    return this._container;
  },

  onRemove: function() {
  },

  _createLink: function() {
    var options = {
        zoom: this._map.getZoom(),
        center: this._map.getCenter(),
        waypoints: this._lrm.getWaypoints(),
        },
        link = links.formatLink(window.location.search, options);
    window.location.href = link;
  }

});

module.exports = {
  control: function(lrm, options) {
    return new Control(lrm, options);
  },
};
