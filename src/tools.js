'use strict';

var L = require('leaflet');

var Control = L.Control.extend({
  includes: L.Mixin.Events,
  options: {
    toolContainerClass: "",
    editorButtonClass: "",
    josmButtonClass: "",
    debugButtonClass: "",
    mapillaryButtonClass: "",
    localizationButtonClass: ""
  },

  initialize: function(localization, languages, options) {
    L.setOptions(this, options);
    this._local = localization;
    this._languages = languages;
  },

  onAdd: function(map) {
    var editorContainer,
      editorButton,
      josmContainer,
      josmButton,
      debugContainer,
      debugButton,
      mapillaryContainer,
      mapillaryButton,
      localizationButton,
      popupCloseButton,
      gpxContainer;
    this._container = L.DomUtil.create('div', 'leaflet-osrm-tools-container ' + this.options.toolsContainerClass);
    this._localizationList = this._createLocalizationList();
    L.DomEvent.disableClickPropagation(this._container);
    editorContainer = L.DomUtil.create('div', 'leaflet-osrm-tools-editor', this._container);
    editorButton = L.DomUtil.create('span', this.options.editorButtonClass, editorContainer);
    editorButton.title = this._local['Open in editor'];
    L.DomEvent.on(editorButton, 'click', this._openEditor, this);
    josmContainer = L.DomUtil.create('div', 'leaflet-osrm-tools-josm', this._container);
    josmButton = L.DomUtil.create('span', this.options.josmButtonClass, josmContainer);
    josmButton.title = this._local['Open in JOSM'];
    L.DomEvent.on(josmButton, 'click', this._openJOSM, this);
    debugContainer = L.DomUtil.create('div', 'leaflet-osrm-tools-debug', this._container);
    debugButton = L.DomUtil.create('span', this.options.debugButtonClass, debugContainer);
    debugButton.title = this._local['Open in Debug Map'];
    L.DomEvent.on(debugButton, 'click', this._openDebug, this);
    mapillaryContainer = L.DomUtil.create('div', 'leaflet-osrm-tools-mapillary', this._container);
    mapillaryButton = L.DomUtil.create('span', this.options.mapillaryButtonClass, mapillaryContainer);
    mapillaryButton.title = this._local['Open in Mapillary'];
    L.DomEvent.on(mapillaryButton, 'click', this._openMapillary, this);
    this._localizationContainer = L.DomUtil.create('div', 'leaflet-osrm-tools-localization', this._container);
    this._createLocalizationList(this._localizationContainer);
    L.DomEvent.on(this._localizationContainer, 'mouseenter', this._openLocalizationList, this);
    L.DomEvent.on(this._localizationContainer, 'mouseleave', this._closeLocalizationList, this);
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

  _openDebug: function() {
    var position = this._map.getCenter(),
      zoom = this._map.getZoom(),
      prec = 6;
    window.open("http://map.project-osrm.org/debug/#" + zoom + "/" + position.lat.toFixed(prec) + "/" + position.lng.toFixed(prec));
  },

  _openMapillary: function() {
    var position = this._map.getCenter(),
      zoom = this._map.getZoom(),
      prec = 6;
    window.open("https://www.mapillary.com/app/?lat=" + position.lat.toFixed(prec) + "&lng=" + position.lng.toFixed(prec) + "&z=" + zoom);
  },

  _updatePopupPosition: function(button) {
    var rect = this._container.getBoundingClientRect(),
        left = 0;
    if (button)
    {
        left = button.getBoundingClientRect().left - rect.left;
    }
    this._popupWindow.style.position = 'absolute';
    this._popupWindow.style.left = left + 'px';
    this._popupWindow.style.bottom = rect.height + 'px';
  },

  _createLocalizationList: function(container) {
    var localizationButton = L.DomUtil.create('span', this.options.localizationButtonClass + "-" + this._local.key, container);
    localizationButton.title = this._local['Select language'];
    L.DomEvent.on(localizationButton, 'click', function() { this.fire("languagechanged", {language: this._local.key}); }, this);
    for (var key in this._languages)
    {
        if (key == this._local.key)
        {
            continue;
        }
        var button = L.DomUtil.create('span', this.options.localizationButtonClass + "-" + key + " leaflet-osrm-tools-hide", container);
        button.title = this._languages[key];
        var ev = {language: String(key)};
        L.DomEvent.on(button, 'click', function() { this.fire("languagechanged", ev); }, this);
    }
  },

  _openLocalizationList: function() {
    var child;
    for (var i = 1; i < this._localizationContainer.childNodes.length; ++i)
    {
      child = this._localizationContainer.childNodes[i];
      L.DomUtil.removeClass(child, 'leaflet-osrm-tools-hide');
    }
  },

  _closeLocalizationList: function() {
    var child;
    for (var i = 1; i < this._localizationContainer.childNodes.length; ++i)
    {
        child = this._localizationContainer.childNodes[i];
        L.DomUtil.addClass(child, 'leaflet-osrm-tools-hide');
    }
  },

});

module.exports = {
  control: function(localization, languages, options) {
    return new Control(localization, languages, options);
  }
};
