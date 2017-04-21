'use strict';

var L = require('leaflet');

module.exports = function (language) {
  var osrmTextInstructionsOptions = {
    hooks: {
      tokenizedInstruction: function (instruction) {
        // enclose {way_name}, {rotary_name} and {destination} vars with <b>..</b>
        // also support optional grammar or other var option after colon like {way_name:accusative}
        return instruction.replace(/\{(\w+):?\w*\}/g, function (token, tag) {
          switch (tag) {
          case 'way_name':
          case 'rotary_name':
          case 'destination':
            return '<b>' + token + '</b>';
          }
          return token;
        });
      }
    }
  };
  var osrmTextInstructions = require('osrm-text-instructions')('v5', language, osrmTextInstructionsOptions);

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

    var maneuver = step.maneuver.modifier || '';

    return lanes.map(function(lane, index) {
      var classes = ['leaflet-routing-icon', 'lanes'];
      if (!lane.valid) classes.push(['invalid']);

      // check maneuver direction matches this lane one(s)
      var maneuverIndication = lane.indications.indexOf(maneuver);
      if (maneuverIndication === -1) {
        // check non-indicated lane to allow straight, right turn from last lane and left turn for first lane
        if ((lane.indications[0] === 'none' || lane.indications[0] === '') && (
          maneuver === 'straight' ||
          (index === 0 && maneuver.slice(-4) === 'left') ||
          (index === (lanes.length - 1) && maneuver.slice(-5) === 'right'))) {
          maneuverIndication = 0;
        } else if (maneuver.slice(0, 7) === 'slight ' ) {
          // try to exclude 'slight' modifier
          maneuverIndication = lane.indications.indexOf(maneuver.slice(7));
        }
      }
      var indication = (maneuverIndication === -1) ? lane.indications[0] : maneuver;

      var icon;
      switch (indication) {
      case 'right':
        icon = 'turn-right';
        break;
      case 'sharp right':
        icon = 'sharp-right';
        break;
      case 'slight right':
        icon = 'bear-right';
        break;
      case 'left':
        icon = 'turn-left';
        break;
      case 'sharp left':
        icon = 'sharp-left';
        break;
      case 'slight left':
        icon = 'bear-left';
        break;
      case 'uturn':
        icon = 'u-turn';
        break;
      //case 'straight':
      //case 'none':
      default:
        icon = 'continue';
        break;
      }
      classes.push('leaflet-routing-icon-' + icon);

      var span = L.DomUtil.create('span', classes.join(' '));
      
      // gray out lane icon if it's not for this maneuver
      if (maneuverIndication === -1)
        L.DomUtil.setOpacity(span, 0.5);
      
      return span;
    });
  }

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
      span = L.DomUtil.create('span', 'leaflet-routing-icon leaflet-routing-icon-' + icon, td);
      td.appendChild(span);

      // text instruction
      td = L.DomUtil.create('td', '', row);
      // keep HTML tags instead:
      // td.appendChild(document.createTextNode(stepToText(text)));
      td.innerHTML = stepToText(text);

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
      if (distance.slice(0, 2) !== '0 ') {
        td = L.DomUtil.create('td', 'distance', row);
        td.appendChild(document.createTextNode(distance));
      }

      return row;
    }
  });

  return L.Routing;
}
