'use strict';

var links = require('./links'),
  localization = require('./localization');

var Control = L.Control.extend({
  include: L.Mixin.Events,
  options: {
    popupWindowClass: "",
    popupCloseButtonClass: "",
    toolContainerClass: "",
    editorButtonClass: "",
    josmButtonClass: "",
    localizationButtonClass: "",
    gpxLinkClass: ""
  },

  initialize: function(lrm, options) {
    L.setOptions(this, options);
    this._lrm = lrm;
    lrm.on('routesfound', this._updateDownloadLink, this);
    lrm.on('routeselected', function(e) {
      this._selectedAlternative = e.route;
    }, this);
  },

  onAdd: function(map) {
    var editorContainer,
      editorButton,
      josmContainer,
      josmButton,
      popupCloseButton,
      gpxContainer;
    this._container = L.DomUtil.create('div', 'leaflet-osrm-tools-container leaflet-bar ' + this.options.toolsContainerClass);
    L.DomEvent.disableClickPropagation(this._container);
    editorContainer = L.DomUtil.create('div', 'leaflet-osrm-tools-editor', this._container);
    editorButton = L.DomUtil.create('span', this.options.editorButtonClass, editorContainer);
    editorButton.title = localization[this.options.language]['Open in editor'];
    L.DomEvent.on(editorButton, 'click', this._openEditor, this);
    josmContainer = L.DomUtil.create('div', 'leaflet-osrm-tools-josm', this._container);
    josmButton = L.DomUtil.create('span', this.options.josmButtonClass, josmContainer);
    josmButton.title = localization[this.options.language]['Open in JOSM'];
    L.DomEvent.on(josmButton, 'click', this._openJOSM, this);
    gpxContainer = L.DomUtil.create('div', 'leaflet-osrm-tools-gpx', this._container);
    this._gpxLink = L.DomUtil.create('a', this.options.gpxLinkClass, gpxContainer);
    this._popupWindow = L.DomUtil.create('div',
      'leaflet-osrm-tools-popup leaflet-osrm-tools-popup-hide ' + this.options.popupWindowClass,
      this._container);
    this._popupContainer = L.DomUtil.create('div', '', this._popupWindow);
    popupCloseButton = L.DomUtil.create('span', 'leaflet-osrm-tools-popup-close ' + this.options.popupCloseButtonClass, this._popupWindow);
    L.DomEvent.on(popupCloseButton, 'click', this._closePopup, this);
    return this._container;
  },

  onRemove: function() {},

  _openEditor: function() {
    var position = this._map.getCenter(),
      zoom = this._map.getZoom(),
      prec = 6;
    window.open("http://www.openstreetmap.org/edit?lat=" + position.lat.toFixed(prec) + "&lon=" + position.lng.toFixed(prec) + "&zoom=" + zoom);
  },

  _openJOSM: function() {
    var bounds = this._map.getBounds(),
      url = 'http://127.0.0.1:8111/load_and_zoom' +
      '?left=' + bounds.getWest() +
      '&right=' + bounds.getEast() +
      '&bottom=' + bounds.getSouth() +
      '&top=' + bounds.getNorth();
    window.open(url);
  },

  _getLinkOptions: function() {
    return {
      zoom: this._map.getZoom(),
      center: this._map.getCenter(),
      waypoints: this._lrm.getWaypoints(),
      language: this.options.language,
      units: this.options.units,
      alternative: this._selectedAlternative
    };
  },

  _updateDownloadLink: function() {
    var plan = this._lrm.getPlan(),
      router = this._lrm.getRouter(),
      url;
    if (!plan.isReady()) {
      return;
    }
    url = router.buildRouteUrl(plan.getWaypoints(), {
      fileformat: 'gpx'
    });
    this._gpxLink.href = url;
  },

  _updatePopupPosition: function() {
    var rect = this._container.getBoundingClientRect();
    this._popupWindow.style.position = 'absolute';
    this._popupWindow.style.left = '0px';
    this._popupWindow.style.bottom = rect.height + 'px';
  },

  _openPopup: function(content) {
    var children = this._popupContainer.children,
      i;
    this._updatePopupPosition();
    for (i = 0; i < children.length; i++) {
      this._popupContainer.removeChild(children[i]);
    }
    this._popupContainer.appendChild(content);
    L.DomUtil.removeClass(this._popupWindow, 'leaflet-osrm-tools-popup-hide');
  },

  _closePopup: function() {
    L.DomUtil.addClass(this._popupWindow, 'leaflet-osrm-tools-popup-hide');
  }
});

module.exports = {
  control: function(lrm, options) {
    return new Control(lrm, options);
  }
};