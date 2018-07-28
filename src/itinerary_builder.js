'use strict';

var L = require('leaflet');

module.exports = function (language) {
  var osrmTextInstructions = require('osrm-text-instructions')('v5');

  function stepToText(step) {
    try {
      return osrmTextInstructions.compile(language, step, {
        formatToken : function(token, value) {
        // enclose {way_name}, {rotary_name}, {destination} and {exit} vars with <b>..</b>
        if (value) {
          switch (token) {
            case 'way_name':
            case 'rotary_name':
            case 'waypoint_name':
            case 'destination':
            case 'exit':
              // Exclude prepending articles/prepositions from French names
              return value.replace(/^((à )|(au )|(aux )|(le rond-point ))?((d’)|(de )|(des )|(du ))?((l’)|(la )|(le )|(les ))?/,
                '$&<b>') + '</b>';
            }
          }
          return value;
        }
      });
    } catch(err) {
      console.log('Error when compiling text instruction', err, step);
      return undefined;
    }
  }

  function stepToLanes(step) {
    var lanes = step.intersections[0].lanes;
    if (!lanes) return [];
    // main maneuver
    var maneuver = step.maneuver.modifier || '';
    // accumulative lane icon offset
    var offset = 0;
    // process each lane
    return lanes.map(function(lane, index) {
      var indicationOffset = offset;
      // draw icon for each allowed maneuver from this lane
      var spans = lane.indications.map(function(indication, indicationIndex, indications) {
        var validIndication = lane.valid;
        if (lane.valid && maneuver !== indication && indications.length > 1) {
          // gray out inappropriate indication if there are a few ones for this lane
          if (maneuver === 'straight' && (indication === 'none' || indication === '')) {
            validIndication = true;
          } else if (maneuver.slice(0, 7) === 'slight ') {
            // try to exclude 'slight' modifier
            validIndication = (indication === maneuver.slice(7));
          } else {
            // try to add 'slight' modifier otherwise
            validIndication = (indication === 'slight ' + maneuver);
          }
        }
        // transform lane indication into icon class
        var icon;
        if (indication === 'none' || indication === '')
          icon = 'straight'
        else if (indication === 'uturn' && step.driving_side === 'left') // use u-turn icon for left driving side
          icon = 'uturn-right';
        else
          icon = indication.replace(' ', '-');
        // calcuate offset to draw each next icons in the same lane on the same place
        var iconOffset = 20 * indicationIndex; // icon has 20px width
        var iconPos = offset + iconOffset;
        if (iconPos > indicationOffset)
          indicationOffset = iconPos;
        // create span element with necessary icon class
        var span = L.DomUtil.create('span', 'osrm-lane-icon ' + (validIndication ? '' : 'invalid ') + icon);
        if (iconPos > 0)
          span.setAttribute('style', 'position: relative; left: -' + iconPos + 'px;');
        return span;
      });
      // shift global offset for next lane
      if (indicationOffset > offset)
        offset = indicationOffset;
      return spans;
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
        l.forEach(function(laneIcons) {
          laneIcons.forEach(function(laneIcon) {
            td.appendChild(laneIcon);
          });
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
