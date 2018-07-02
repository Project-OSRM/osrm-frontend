'use strict';

var L = require('leaflet');
var JXON = require('jxon');
JXON.config({attrPrefix: '@'});
var FileSaver = require('file-saver');

var Control = L.Control.extend({
  includes: L.Mixin.Events,
  options: {
    toolContainerClass: "",
    editorButtonClass: "",
    josmButtonClass: "",
    debugButtonClass: "",
    mapillaryButtonClass: "",
    gpxButtonClass: "",
    localizationChooserClass: ""
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
    gpxContainer = L.DomUtil.create('div', 'leaflet-osrm-tools-gpx', this._container);
    gpxButton = L.DomUtil.create('span', this.options.gpxButtonClass, gpxContainer);
    this._gpxButton = gpxButton;
    gpxButton.title = this._local['GPX'];
    gpxButton.setAttribute('disabled', '');
    L.DomEvent.on(gpxButton, 'click', this._downloadGPX, this);
    this._localizationContainer = L.DomUtil.create('div', 'leaflet-osrm-tools-localization', this._container);
    this._createLocalizationList(this._localizationContainer);
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
      prec = 6;
    window.open("debug/#" + zoom + "/" + position.lat.toFixed(prec) + "/" + position.lng.toFixed(prec));
  },

  _openMapillary: function() {
    var position = this._map.getCenter(),
      zoom = this._map.getZoom(),
      prec = 6;
    window.open("https://www.mapillary.com/app/?lat=" + position.lat.toFixed(prec) + "&lng=" + position.lng.toFixed(prec) + "&z=" + zoom);
  },

  setRouteGeoJSON: function(routeGeoJSON) {
    this.routeGeoJSON = routeGeoJSON;
    if (this.routeGeoJSON) {
      this._gpxButton.removeAttribute('disabled');
    }
    else {
      this._gpxButton.setAttribute('disabled', '');
    }
  },

  _downloadGPX: function() {
    if (this.routeGeoJSON) {
      var properties = this.routeGeoJSON.properties;
      var metadata = {
        'name': properties.name,
        'copyright': {
          '@author': properties.copyright.author,
          'license': properties.copyright.license
        },
        'link': {
          '@href': properties.link.href,
          'text': properties.link.text
        },
        'time': properties.time
      };
      var trackPoints = this.routeGeoJSON.geometry.coordinates.map(function (coordinate) {
        return {
          '@lat': coordinate[1],
          '@lon': coordinate[0],
        };
      });
      var gpx = {
        'gpx': {
          '@xmlns': 'http://www.topografix.com/GPX/1/1',
          '@xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
          '@xsi:schemaLocation': 'http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd',
          '@creator': 'osrm',
          '@version': '1.1',
          'metadata': metadata,
          'trk': {
            'trkseg': {
              'trkpt': trackPoints
            }
          }
        }
      };
      var gpxData = JXON.stringify(gpx);
      // Work around issues with XML name space generation in IE 11
      // (see also https://github.com/tyrasd/jxon/issues/42)
      gpxData = gpxData.replace(/\s+xmlns:NS\d+=""/g, '').replace(/NS\d+:/g, '');
      var blob = new Blob(['<?xml version="1.0" encoding="utf-8"?>', '\n', gpxData], {
        type: 'application/gpx+xml;charset=utf-8'
      }, false);
      FileSaver.saveAs(blob, 'route.gpx');
    }
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
        if (key == _this._local.key)
        {
            option.setAttribute('selected', '');
        }
    });
  }
});

module.exports = {
  control: function(localization, languages, options) {
    return new Control(localization, languages, options);
  }
};
