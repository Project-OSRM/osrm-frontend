(function() {
  'use strict';

  var osrmTextInstructions = require('osrm-text-instructions')();

  function stepToText(step) {
    try {
      return osrmTextInstructions.compile(step);
    } catch(err) {
      console.log('Error when compiling text instruction', err, step);
      return undefined;
    }
  }

  function stepToLanes(step) {
    var lanes = step.intersections[0].lanes;

    if (!lanes) return [];

    return lanes.map(function(l) {
      var classes = [ 'leaflet-routing-icon', 'lanes'];
      if (!l.valid) classes.push(['invalid']);

      var icon;
      switch (l.indications[0]) {
      case 'right':
      case 'sharp right':
        icon = 'turn-right';
        break;
      case 'slight right':
        icon = 'bear-right';
        break;
      case 'left':
      case 'slight-left':
        icon = 'turn-left';
        break
      case 'sharp-left':
        icon = 'bear-left';
        break;
      case 'straight':
      case 'none':
      default:
        icon = 'continue';
        break;
      }
      classes.push('leaflet-routing-icon-' + icon);

      return L.DomUtil.create('span', classes.join(' '));
    });
  }

  var L = require('leaflet');
  L.Routing = L.Routing || {};

  L.Routing.ItineraryBuilder = L.Class.extend({
    options: {
      containerClassName: ''
    },

    initialize: function(options) {
      L.setOptions(this, options);
    },

    createContainer: function(className) {
      var table = L.DomUtil.create('table', className || ''),
        colgroup = L.DomUtil.create('colgroup', '', table);

      L.DomUtil.create('col', 'leaflet-routing-instruction-icon', colgroup);
      L.DomUtil.create('col', 'leaflet-routing-instruction-text', colgroup);
      L.DomUtil.create('col', 'leaflet-routing-instruction-distance', colgroup);

      return table;
    },

    createStepsContainer: function() {
      return L.DomUtil.create('tbody', '');
    },

    createStep: function(text, distance, icon, steps) {
      var row = L.DomUtil.create('tr', '', steps),
        span,
        td;

      // icon
      td = L.DomUtil.create('td', '', row);
      span = L.DomUtil.create('span', 'leaflet-routing-icon leaflet-routing-icon-'+icon, td);
      td.appendChild(span);

      // text instruction
      td = L.DomUtil.create('td', '', row);
      td.appendChild(document.createTextNode(stepToText(text)));

      // lanes
      var l = stepToLanes(text);
      if (l) {
        td.appendChild(document.createElement('br'));
        l.forEach(function(laneIcon) {
          td.appendChild(laneIcon);
        });
      }

      // distance steps
      // filter distance after arrival
      if (distance !== '0 m') {
        td = L.DomUtil.create('td', 'distance', row);
        td.appendChild(document.createTextNode(distance));
      }

      return row;
    }
  });

  module.exports = L.Routing;
})();
