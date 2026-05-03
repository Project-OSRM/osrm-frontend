'use strict';

var L = require('leaflet');
var FileSaver = require('file-saver');
var buildGPX = require('./gpx');
var shortlink = require('./shortlink');
var version = require('./version');
var eventedMethods = L.Evented ? L.Evented.prototype : L.Mixin.Events;

function stopEvent(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
}

function selectInput(input) {
  input.focus();
  input.select();
}

function defer(fn) {
  window.setTimeout(fn, 0);
}

var Control = L.Control.extend({
  includes: eventedMethods,
  options: {
    toolsContainerClass: "",
    editorButtonClass: "",
    josmButtonClass: "",
    debugButtonClass: "",
    mapillaryButtonClass: "",
    shareButtonClass: "",
    gpxButtonClass: "",
    localizationChooserClass: "",
    unitsChooserClass: ""
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
      shareContainer,
      localizationButton,
      popupCloseButton,
      gpxContainer,
      gpxButton;
    this._container = L.DomUtil.create('div', 'leaflet-osrm-tools-container ' + this.options.toolsContainerClass);
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
    shareContainer = L.DomUtil.create('div', 'leaflet-osrm-tools-share', this._container);
    this._shareContainer = shareContainer;
    L.DomEvent.disableClickPropagation(shareContainer);
    L.DomEvent.on(shareContainer, 'mousedown', stopEvent);
    L.DomEvent.on(shareContainer, 'mouseup', stopEvent);
    L.DomEvent.on(shareContainer, 'click', stopEvent);
    this._shareButton = L.DomUtil.create('span', this.options.shareButtonClass, shareContainer);
    this._shareButton.title = this._local['Share Route'];
    L.DomEvent.on(this._shareButton, 'click', this._toggleSharePopup, this);
    gpxContainer = L.DomUtil.create('div', 'leaflet-osrm-tools-gpx', this._container);
    gpxButton = L.DomUtil.create('span', this.options.gpxButtonClass, gpxContainer);
    this._gpxButton = gpxButton;
    gpxButton.title = this._local['GPX'];
    gpxButton.setAttribute('disabled', '');
    L.DomEvent.on(gpxButton, 'click', this._downloadGPX, this);
    this._localizationContainer = L.DomUtil.create('div', 'leaflet-osrm-tools-localization', this._container);
    this._createLocalizationList(this._localizationContainer);
    this._createUnitsChooser(this._localizationContainer);
    this._createVersionInfo(this._container);
    return this._container;
  },

  onRemove: function() {},

  _openEditor: function() {
    var position = this._map.getCenter(),
      zoom = this._map.getZoom(),
      prec = 6;
    window.open("https://www.openstreetmap.org/edit?lat=" + position.lat.toFixed(prec) + "&lon=" + position.lng.toFixed(prec) + "&zoom=" + zoom);
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
      prec = 6,
      debugUrl = new URL('debug/', window.location.href);
    debugUrl.hash = zoom + "/" + position.lat.toFixed(prec) + "/" + position.lng.toFixed(prec);
    window.open(debugUrl.href);
  },

  _openMapillary: function() {
    var position = this._map.getCenter(),
      zoom = this._map.getZoom(),
      prec = 6;
    window.open("https://www.mapillary.com/app/?lat=" + position.lat.toFixed(prec) + "&lng=" + position.lng.toFixed(prec) + "&z=" + zoom);
  },

  _toggleSharePopup: function(event) {
    stopEvent(event);
    if (L.DomUtil.hasClass(this._shareContainer, 'share-popup-visible')) {
      this._hideSharePopup();
    } else {
      this._showSharePopup();
    }
  },

  _showSharePopup: function() {
    var linkButton,
      shortLinkButton,
      overlay,
      container,
      currentUrl = window.document.location.href,
      input,
      typeButtonContainer;

    this._hideSharePopup();
    L.DomUtil.addClass(this._shareContainer, 'share-popup-visible');
    this._sharePopup = L.DomUtil.create('div', 'share-popup fill-osrm dark', this._shareContainer);

    overlay = L.DomUtil.create('div', 'share-overlay', this._sharePopup);
    L.DomEvent.on(overlay, 'mousedown', stopEvent);
    L.DomEvent.on(overlay, 'mouseup', stopEvent);
    L.DomEvent.on(overlay, 'click', this._hideSharePopup, this);

    container = L.DomUtil.create('div', 'share-container', this._sharePopup);
    L.DomEvent.on(container, 'mousedown', stopEvent);
    L.DomEvent.on(container, 'mouseup', stopEvent);
    L.DomEvent.on(container, 'click', function(event) {
      stopEvent(event);
    });

    typeButtonContainer = L.DomUtil.create('div', 'share-type-button-container', container);
    linkButton = L.DomUtil.create('button', 'share-type selected', typeButtonContainer);
    linkButton.setAttribute('type', 'button');
    linkButton.textContent = this._local['Link'];

    shortLinkButton = L.DomUtil.create('button', 'share-type', typeButtonContainer);
    shortLinkButton.setAttribute('type', 'button');
    shortLinkButton.textContent = this._local['Shortlink'];

    input = L.DomUtil.create('input', 'share-url', container);
    input.setAttribute('readonly', '');
    input.value = currentUrl;
    this._shareUrlInput = input;
    this._shareUrl = currentUrl;
    selectInput(input);

    L.DomEvent.on(input, 'click', function() {
      selectInput(input);
    });

    L.DomEvent.on(linkButton, 'click', function(event) {
      stopEvent(event);
      if (!L.DomUtil.hasClass(linkButton, 'selected')) {
        L.DomUtil.addClass(linkButton, 'selected');
        L.DomUtil.removeClass(shortLinkButton, 'selected');
      }
      input.value = currentUrl;
      selectInput(input);
    });

    L.DomEvent.on(shortLinkButton, 'click', function(event) {
      stopEvent(event);
      if (!L.DomUtil.hasClass(shortLinkButton, 'selected')) {
        L.DomUtil.addClass(shortLinkButton, 'selected');
        L.DomUtil.removeClass(linkButton, 'selected');
      }
      if (this._shortLink && this._shortLinkUrl === currentUrl) {
        input.value = this._shortLink;
        selectInput(input);
        return;
      }
      shortlink.osmli(currentUrl, function(shortUrl) {
        if (this._shareUrl !== currentUrl || this._shareUrlInput !== input) {
          return;
        }
        this._shortLink = shortUrl || currentUrl;
        this._shortLinkUrl = currentUrl;
        input.value = this._shortLink;
        selectInput(input);
      }.bind(this));
    }, this);
  },

  _hideSharePopup: function(event) {
    var sharePopup = this._sharePopup;
    stopEvent(event);
    this._shareUrl = null;
    this._shareUrlInput = null;
    L.DomUtil.removeClass(this._shareContainer, 'share-popup-visible');
    this._sharePopup = null;
    defer(function() {
      if (sharePopup && sharePopup.parentNode) {
        sharePopup.parentNode.removeChild(sharePopup);
      }
    });
  },

  setRouteGeoJSON: function(routeGeoJSON) {
    this.routeGeoJSON = routeGeoJSON;
    if (this.routeGeoJSON) {
      this._gpxButton.removeAttribute('disabled');
    } else {
      this._gpxButton.setAttribute('disabled', '');
    }
  },

  _downloadGPX: function() {
    if (this.routeGeoJSON) {
      var gpxData = buildGPX(this.routeGeoJSON);
      var blob = new Blob(['<?xml version="1.0" encoding="utf-8"?>\n', gpxData], {
        type: 'application/gpx+xml;charset=utf-8'
      }, false);
      FileSaver.saveAs(blob, 'route.gpx');
    }
  },

  _updatePopupPosition: function(button) {
    var rect = this._container.getBoundingClientRect(),
      left = 0;
    if (button) {
      left = button.getBoundingClientRect().left - rect.left;
    }
    this._popupWindow.style.position = 'absolute';
    this._popupWindow.style.left = left + 'px';
    this._popupWindow.style.bottom = rect.height + 'px';
  },

  _createLocalizationList: function(container) {
    var _this = this;
    var localizationSelect = L.DomUtil.create('select', _this.options.localizationChooserClass, container);
    localizationSelect.setAttribute('title', _this._local['Select language']);
    L.DomEvent.on(localizationSelect, 'change', function(event) {
      this.fire('languagechanged', {
        language: event.target.value
      });
    }, _this);
    Object.keys(this._languages).forEach(function(key) {
      var option = L.DomUtil.create('option', 'fill-osrm', localizationSelect);
      option.setAttribute('value', key);
      option.appendChild(
        document.createTextNode(_this._languages[key])
      );
      if (key == _this._local.key) {
        option.setAttribute('selected', '');
      }
    });
  },

  _createUnitsChooser: function(container) {
    var _this = this;
    var unitsSelect = L.DomUtil.create('select', _this.options.localizationChooserClass, container);
    unitsSelect.setAttribute('title', _this._local['Select units'] || 'Select units');
    L.DomEvent.on(unitsSelect, 'change', function(event) {
      _this.fire('unitschanged', {
        unit: event.target.value
      });
    }, _this);

    var metricOption = L.DomUtil.create('option', 'fill-osrm', unitsSelect);
    metricOption.setAttribute('value', 'metric');
    metricOption.appendChild(document.createTextNode(_this._local['Metric'] || 'Metric'));

    var imperialOption = L.DomUtil.create('option', 'fill-osrm', unitsSelect);
    imperialOption.setAttribute('value', 'imperial');
    imperialOption.appendChild(document.createTextNode(_this._local['Imperial'] || 'Imperial'));

    var initialUnits = _this.options.initialUnits || 'metric';
    if (initialUnits === 'imperial') {
      imperialOption.setAttribute('selected', '');
    } else {
      metricOption.setAttribute('selected', '');
    }
  },

  _createVersionInfo: function(container) {
    var versionInfo = version.getVersionInfo();
    var versionContainer = L.DomUtil.create('div', 'leaflet-osrm-tools-version', container);
    var infoIcon = L.DomUtil.create('div', 'osrm-info-icon', versionContainer);
    infoIcon.setAttribute('title', this._local['Build'] + ': ' + versionInfo.timestamp);
    infoIcon.textContent = '\u24D8';
  },

  updateLocalization: function(localization) {
    this._local = localization;
  }
});

module.exports = {
  control: function(localization, languages, options) {
    return new Control(localization, languages, options);
  }
};
