'use strict';

var Control = L.Control.extend({
  includes: L.Mixin.Events,
  options: {
    popupWindowClass: "",
    popupCloseButtonClass: "",
    toolContainerClass: "",
    editorButtonClass: "",
    josmButtonClass: "",
    localizationButtonClass: ""
  },

  initialize: function(localization, languages, options) {
    console.log(options);
    L.setOptions(this, options);
    this._local = localization;
    this._languages = languages;
  },

  onAdd: function(map) {
    var editorContainer,
      editorButton,
      josmContainer,
      josmButton,
      localizationContainer,
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
    localizationContainer = L.DomUtil.create('div', 'leaflet-osrm-tools-localization', this._container);
    localizationButton = L.DomUtil.create('span', this.options.localizationButtonClass, localizationContainer);
    localizationButton.title = this._local['Select language and units'];
    L.DomEvent.on(localizationButton, 'click', this._openLocalizationList, this);
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

  _updatePopupPosition: function() {
    var rect = this._container.getBoundingClientRect();
    this._popupWindow.style.position = 'absolute';
    this._popupWindow.style.left = '0px';
    this._popupWindow.style.bottom = rect.height + 'px';
  },

  _createLocalizationList: function() {
    var list = L.DomUtil.create('ul');
    for (var key in this._languages)
    {
        var li = L.DomUtil.create('li', '', list);
        li.innerHTML = this._languages[key];
        L.DomEvent.on(li, 'click', function() { this.fire("languagechanged", {language: key}); }, this);
    }
    return list;
  },

  _openLocalizationList: function() {
    this._openPopup(this._localizationList);
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
  control: function(localization, languages, options) {
    return new Control(localization, languages, options);
  }
};
