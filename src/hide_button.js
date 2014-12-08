"use strict";

var HideButton = L.Class.extend({
  options: {
    className: '',
    hideFunction: function() {
    },
    showFunction: function() {
    },
    isHidden: function() {
    },
    border: 'top',
    size: 10,
  },

  initialize: function(options) {
    L.Util.setOptions(this, options);
  },

  _clicked: function() {
    var hidden = this.options.isHidden();
    if (hidden) {
      this.options.showFunction();
    } else {
      this.options.hideFunction();
      // save current position
      this._rect = this._container.getBoundingClientRect();
    }

    this._update();
  },

  _update: function() {
    this._updatePosition();
    this._updateClass();
  },

  _updateClass: function() {
    var hidden = this.options.isHidden();
    if (hidden) {
      L.DomUtil.addClass(this._button, 'leaflet-osrm-hidebutton-hidden');
    } else {
      L.DomUtil.removeClass(this._button, 'leaflet-osrm-hidebutton-hidden');
    }
  },

  _updatePosition: function() {
    var rect = this._rect,
        hidden = this.options.isHidden();
    if (hidden) {
      rect = this._rect;
      if (this.options.border === 'bottom') {
        this._button.style.bottom = (rect.bottom + rect.height - this.options.size) + 'px';
      } else if (this.options.border === 'top') {
        this._button.style.top = '0px';
      } else if (this.options.border === 'left') {
        this._button.style.left = (rect.left + rect.width - this.options.size) + 'px';
      } else if (this.options.border === 'right') {
        this._button.style.right = '0px';
      }
    } else {
      // restore old container position
      if (this.options.border === 'bottom') {
        this._button.style.left = rect.left + 'px';
        this._button.style.bottom = (rect.bottom - this.options.size) + 'px';
        this._button.style.width = (rect.right - rect.left) + 'px';
        this._button.style.height = this.options.size + 'px';
      } else if (this.options.border === 'top') {
        this._button.style.left = rect.left + 'px';
        this._button.style.top = (rect.top - this.options.size) + 'px';
        this._button.style.width = (rect.right - rect.left) + 'px';
        this._button.style.height = this.options.size + 'px';
      } else if (this.options.border === 'left') {
        this._button.style.left = (rect.left - this.options.size) + 'px';
        this._button.style.top = rect.top + 'px';
        this._button.style.height = (rect.bottom - rect.top) + 'px';
        this._button.style.width = this.options.size + 'px';
      } else if (this.options.border === 'right') {
        this._button.style.right = (rect.right - this.options.size) + 'px';
        this._button.style.top = rect.top + 'px';
        this._button.style.height = (rect.bottom - rect.top) + 'px';
        this._button.style.width = this.options.size + 'px';
      }
    }
  },

  addTo: function(container) {
    this._container = container;
    this._button = L.DomUtil.create('div', 'leaflet-osrm-hidebutton ' + this.options.className, container);

    L.DomEvent.on(this._button, 'click', this._clicked, this);
    L.DomEvent.on(this._button, 'hover', this._update, this);
    L.DomEvent.on(this._container, 'resize', this._update, this);

    if (this.options.border === 'top' || this.options.border === 'bottom') {
      L.DomUtil.addClass(this._button, 'leaflet-osrm-hidebutton leaflet-osrm-hidebutton-horizontal');
    } else {
      L.DomUtil.addClass(this._button, 'leaflet-osrm-hidebutton leaflet-osrm-hidebutton-vertical');
    }

    this._rect = this._container.getBoundingClientRect();
    this._updatePosition();

    return this._button;
  },
});

module.exports = function hideButton(options) {
  return new HideButton(options);
};
