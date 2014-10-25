"use strict";

var links = require('./links.js');

var Control = L.Control.extend({
  include: L.Mixin.Events,
  options: {
    linkButtonClass: "",
    popupWindowClass: "",
    popupCloseButtonClass: "",
    toolContainerClass: "",
    gpxLinkClass: "",
  },

  initialize: function(lrm, options) {
    L.setOptions(this, options);
    this._lrm = lrm;
    lrm.on('routesfound', this._updateDownloadLink, this);
  },

  onAdd: function(map) {
    var linkContainer,
        linkButton,
        editorContainer,
        editorButton,
        popupCloseButton,
        gpxContainer;

    this._container = L.DomUtil.create('div', 'leaflet-osrm-tools-container leaflet-bar ' + this.options.toolsContainerClass);
    L.DomEvent.disableClickPropagation(this._container);

    linkContainer = L.DomUtil.create('div', 'leaflet-osrm-tools-link', this._container);
    linkButton = L.DomUtil.create('span', this.options.linkButtonClass, linkContainer);
    // FIXME i18n
    linkButton.title = "Link";
    L.DomEvent.on(linkButton, 'click', this._createLink, this);

    editorContainer = L.DomUtil.create('div', 'leaflet-osrm-tools-editor', this._container);
    editorButton = L.DomUtil.create('span', this.options.editorButtonClass, editorContainer);
    // FIXME i18n
    editorButton.title = "Open in editor";
    L.DomEvent.on(editorButton, 'click', this._openEditor, this);

    gpxContainer = L.DomUtil.create('div', 'leaflet-osrm-tools-gpx', this._container);
    this._gpxLink = L.DomUtil.create('a', this.options.gpxLinkClass, gpxContainer);
    this._gpxLink.innerHTML = "GPX";
    // FIXME i18n
    this._gpxLink.alt = "Download as GPX";

    this._popupWindow = L.DomUtil.create('div',
                                         'leaflet-osrm-tools-popup leaflet-osrm-tools-popup-hide ' + this.options.popupWindowClass,
                                         this._container);
    this._popupContainer = L.DomUtil.create('div', '', this._popupWindow);
    popupCloseButton = L.DomUtil.create('span', 'leaflet-osrm-tools-popup-close ' + this.options.popupCloseButtonClass, this._popupWindow);
    L.DomEvent.on(popupCloseButton, 'click', this._closePopup, this);

    return this._container;
  },

  onRemove: function() {
  },

  _openEditor: function() {
    var position = this._map.getCenter(),
        zoom = this._map.getZoom(),
        prec = 6;
    window.open("http://www.openstreetmap.org/edit?lat=" + position.lat.toFixed(prec) + "&lon=" + position.lng.toFixed(prec) + "&zoom=" + zoom);
  },

  _createLink: function() {
    var options = {
        zoom: this._map.getZoom(),
        center: this._map.getCenter(),
        waypoints: this._lrm.getWaypoints(),
        },
        shortener,
        link,
        linkContainer,
        linkInput,
        linkShortener,
        linkShortenerLabel;

    link = links.format(window.location.href, options);
    shortener = links.shortener();
    //window.location.href = link;

    linkContainer = L.DomUtil.create('div', 'dark checkbox-pill');
    linkInput = L.DomUtil.create('input', '', linkContainer);
    linkInput.value = link;
    linkShortener = L.DomUtil.create('input', 'dark stretch', linkContainer);
    linkShortener.type = 'checkbox';
    linkShortener.id = 'short';
    linkShortenerLabel = L.DomUtil.create('label', 'button icon check', linkContainer);
    linkShortenerLabel.setAttribute("for", "short");
    // FIXME i18n
    linkShortenerLabel.innerHTML = "Short";

    L.DomEvent.on(linkShortener, 'click', function() {
      shortener.shorten(link, function(result) {
        if (result === "") {
          linkShortener.checked = false;
        } else {
          linkInput.value = result;
        }
      });
    }, this);

    this._openPopup(linkContainer);
  },

  _updateDownloadLink: function() {
    var url = this._lrm.getDownloadURL('gpx');
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

    for (i = 0; i < children.length; i++)
    {
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
  },
};
