'use strict';

/*
 * Creats a itinerary container that contains the instructions.
 * This will override the LRM internal build that uses a table as container.
 * However using a table does not work with our theme.
 */

var L = require('leaflet');

var ItineraryBuilder = L.Class.extend({
  options: {
    containerClassName: ''
  },
  initialize: function (options) {
    L.setOptions(this, options);
  },
  createContainer: function () {
    return L.DomUtil.create('div', this.options.containerClassName);
  },
  createStepsContainer: function () {
    return L.DomUtil.create('ol', '');
  },
  createStep: function (text, distance, icon, steps) {
    var row = L.DomUtil.create('li', 'osrm-directions-step', steps),
      td;
    L.DomUtil.create('span', 'osrm-directions-icon osrm-'+icon+'-icon', row);
    td = L.DomUtil.create('div', 'osrm-directions-step-maneuver', row);
    td.appendChild(document.createTextNode(text));
    td = L.DomUtil.create('div', 'osrm-directions-step-distance', row);
    td.appendChild(document.createTextNode(distance));
    return row;
  }
});

module.exports = function (options) {
  return new ItineraryBuilder(options);
};
