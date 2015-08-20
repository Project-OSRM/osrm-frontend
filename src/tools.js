"use strict";

var links = require('./links'),
    localization = require('./localization');

var Control = L.Control.extend({
  include: L.Mixin.Events,
  options: {
    /*linkButtonClass: "",*/
    popupWindowClass: "",
    popupCloseButtonClass: "",
    toolContainerClass: "",
    editorButtonClass: "",
    josmButtonClass: "",
    localizationButtonClass: "",
    printButtonClass: "",
    gpxLinkClass: "",
    language: "en",
    units: "metric"
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
    var /*linkContainer,
        linkButton,*/
        editorContainer,
        editorButton,
        josmContainer,
        josmButton,
        popupCloseButton,
        localizationContainer,
        localizationButton,
        printContainer,
        printButton,
        gpxContainer;

    this._container = L.DomUtil.create('div', 'leaflet-osrm-tools-container leaflet-bar ' + this.options.toolsContainerClass);
    L.DomEvent.disableClickPropagation(this._container);
	/*
    linkContainer = L.DomUtil.create('div', 'leaflet-osrm-tools-link', this._container);
    linkButton = L.DomUtil.create('span', this.options.linkButtonClass, linkContainer);
    linkButton.title = localization[this.options.language]['Link'];
    
    L.DomEvent.on(linkButton, 'click', this._showLink, this);
	*/
    editorContainer = L.DomUtil.create('div', 'leaflet-osrm-tools-editor', this._container);
    editorButton = L.DomUtil.create('span', this.options.editorButtonClass, editorContainer);
    editorButton.title = localization[this.options.language]['Open in editor'];
    L.DomEvent.on(editorButton, 'click', this._openEditor, this);

    josmContainer = L.DomUtil.create('div', 'leaflet-osrm-tools-josm', this._container);
    josmButton = L.DomUtil.create('span', this.options.josmButtonClass, josmContainer);
    josmButton.title = localization[this.options.language]['Open in JOSM'];
    L.DomEvent.on(josmButton, 'click', this._openJOSM, this);

    localizationContainer = L.DomUtil.create('div', 'leaflet-osrm-tools-localization', this._container);
    localizationButton = L.DomUtil.create('span', this.options.localizationButtonClass, localizationContainer);
    localizationButton.title = localization[this.options.language]['Select language and units'];
    L.DomEvent.on(localizationButton, 'click', this._selectLocalization, this);

    printContainer = L.DomUtil.create('div', 'leaflet-osrm-tools-print', this._container);
    printButton = L.DomUtil.create('span', this.options.printButtonClass, printContainer);
    printButton.title = localization[this.options.language]['Print'];
    L.DomEvent.on(printButton, 'click', this._printPage, this);

    gpxContainer = L.DomUtil.create('div', 'leaflet-osrm-tools-gpx', this._container);
    this._gpxLink = L.DomUtil.create('a', this.options.gpxLinkClass, gpxContainer);
    this._gpxLink.innerHTML = "GPX";
    this._gpxLink.alt = localization[this.options.language]['Download as GPX'];

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
      alternative: this._selectedAlternative,
    };
  },
/*
  _showLink: function() {
    var shortener,
        link,
        linkContainer,
        linkInput,
        linkShortener,
        linkShortenerLabel;

    link = links.format(window.location.href, this._getLinkOptions());
	// console.log(link);
    this._map.fire('link', { link: link });

    shortener = links.shortener();
    // window.location.href = link;  <= this was the error

    linkContainer = L.DomUtil.create('div', 'dark checkbox-pill');
    linkInput = L.DomUtil.create('input', '', linkContainer);
    linkInput.value = link;
    linkShortener = L.DomUtil.create('input', 'dark stretch', linkContainer);
    linkShortener.type = 'checkbox';
    linkShortener.id = 'short';
    linkShortenerLabel = L.DomUtil.create('label', '', linkContainer);
    linkShortenerLabel.setAttribute("for", "short");
    linkShortenerLabel.innerHTML = localization[this.options.language]['Short'];

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
*/

  _printPage: function() {
    var options = this._getLinkOptions(),
        validWPs = options.waypoints.filter(function(wp) { return wp.latLng !== undefined; }),
        // link = window.location.href.replace("/index.html#", "/printing.html#").replace("/#", "/printing.html#")
        link = window.location.href.replace("/index.html?", "/printing.html?").replace("/?", "/printing.html?")
        window.open(link);


    if (link.slice(-1) === '#') {
      link += "printing.html";
    }
    if (validWPs.length < 2 ) {
      return;
    }
  },

  _selectLocalization: function() {
    var container = L.DomUtil.create('div', 'leaflet-osrm-tools-localization-popup'),
        languageList = L.DomUtil.create('ul', 'leaflet-osrm-tools-language-list', container),
        unitsList = L.DomUtil.create('ul', 'leaflet-osrm-tools-units-list', container),
        options = this._getLinkOptions(),
        language,
        unitSystems,
        i,
        item,
        link;

    for (language in localization)
    {
      item = L.DomUtil.create('il', '', languageList);
      link = L.DomUtil.create('a', '', item);
      options.language = language;
      link.href = links.format(window.location.href, options);
      link.alt = localization[language].name;
      link.innerHTML = localization[language].name;
    }
        
    options.language = this.options.language;
    unitSystems = ['Metric', 'Imperial'];
    for (i = 0; i < unitSystems.length; i++)
    {
      item = L.DomUtil.create('il', '', unitsList);
      link = L.DomUtil.create('a', '', item);
      options.units = unitSystems[i].toLowerCase();
      link.href = links.format(window.location.href, options);
      link.alt = unitSystems[i];
      link.innerHTML = unitSystems[i];
    }
    
    this._openPopup(container);
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
  }
};
