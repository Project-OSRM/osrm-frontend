!function(e){"object"==typeof exports?module.exports=e():"function"==typeof define&&define.amd?define(e):"undefined"!=typeof window?window.osrm=e():"undefined"!=typeof global?global.osrm=e():"undefined"!=typeof self&&(self.osrm=e())}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
"use strict";

var itineraryBuilder = require('./itinerary_builder.js');
var createGeocoder = require('./geocoder.js');

var options = {
    routeWhileDragging: true,
    addWaypoints: false,
    waypointMode: 'snap',
    pointMarkerStyle: {
      radius: 7,
      color: 'white',
      fillColor: '#3BB2D0',
      opacity: 1,
      fillOpacity: 0.7,
      weight: 1,
    },
    lineOptions: {
      styles: [
        {color: 'black', opacity: 0.35, weight: 7},
        {color: 'white', opacity: 0.8, weight: 5},
        {color: '#3BB2D0', opacity: 1, weight: 3}
      ],
    },
    dragStyles: [
      {color: 'black', opacity: 0.15, weight: 7},
      {color: 'white', opacity: 0.3, weight: 4},
      {color: '#3BB2D0', opacity: 1, weight: 2, dashArray: '7,12'}
    ],
    containerClassName: "dark pad2",
    alternativeClassName: "mapbox-directions-instructions",
    stepClassName: "mapbox-directions-step",
    geocodersClassName: "mapbox-directions-inputs",
    createGeocoder: createGeocoder,
    itineraryBuilder: itineraryBuilder({containerClassName: "mapbox-directions-steps"}),
};

module.exports = {
  options: options,
  // this hides the sidebar before the first route
  setup: function(lrm) {
      lrm.hide();
      lrm.on('routeselected', function(r) { lrm.show(); });
    }
};


},{"./geocoder.js":2,"./itinerary_builder.js":4}],2:[function(require,module,exports){
"use strict";

var geocoder = function(i, num) {
  var container = L.DomUtil.create('div',
                                   function() {
                                     if (i === 0) {
                                       return "mapbox-directions-origin";
                                     } else if (i === num-1) {
                                       return "mapbox-directions-destination";
                                     }
                                     return "mapbox-directions-via";
                                   }()),
      label = L.DomUtil.create('label', 'mapbox-form-label', container),
      input = L.DomUtil.create('input', '', container),
      close = L.DomUtil.create('span', 'mapbox-directions-icon mapbox-close-icon', container),
      icon,
      iconName;
  if (i === 0) {
    iconName = "depart";
  } else if (i === num-1){
    iconName = "arrive";
  } else {
    iconName = "via";
  }
  icon  = L.DomUtil.create('div', 'mapbox-directions-icon mapbox-' + iconName  + '-icon', label);
  L.DomEvent.on(close, 'click', function(e) {
    input.value = "";
  });

  return {
    container: container,
    input: input,
  };
};

module.exports = geocoder;


},{}],3:[function(require,module,exports){
"use strict";

var itineraryBuilder = require('./itinerary_builder.js');
var createGeocoder = require('./geocoder.js');
var theme = require('./directions_theme.js');

var mapbox = L.tileLayer('https://{s}.tiles.mapbox.com/v3/dennisl.4e2aab76/{z}/{x}/{y}.png',
    {attribution: '&copy; <a href="http://mapbox.com/">MapBox</a> &copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'}
    );

var map = L.map('map', {layers: [mapbox], zoomControl: false}).setView([48.84, 10.10], 5);

var baseMaps = {
  'Mapbox': mapbox,
};
L.control.layers(baseMaps).addTo(map);

var options = L.extend({
    geocoder: L.Control.Geocoder.nominatim(),
    routeWhileDragging: true,
    addWaypoints: false,
    waypointMode: 'snap',
}, theme.options);

var lrm = L.Routing.control(options);
lrm.addTo(map);

theme.setup(lrm);

},{"./directions_theme.js":1,"./geocoder.js":2,"./itinerary_builder.js":4}],4:[function(require,module,exports){
"use strict";

/*
 * Creats a itinerary container that contains the instructions.
 * This will override the LRM internal build that uses a table as container.
 * However using a table does not work with our theme.
 */
var ItineraryBuilder = L.Class.extend({
  options: {
    containerClassName: ''
  },

  initialize: function(options) {
    L.setOptions(this, options);
  },

  createContainer: function() {
    return L.DomUtil.create('div', this.options.containerClassName);
  },

  createStepsContainer: function() {
    return L.DomUtil.create('ol', '');
  },

  createStep: function(text, distance, icon, steps) {
    var row = L.DomUtil.create('li', 'mapbox-directions-step', steps),
        td;

    L.DomUtil.create('span', 'mapbox-directions-icon mapbox-'+icon+'-icon', row);
    td = L.DomUtil.create('div', 'mapbox-directions-step-maneuver', row);
    td.appendChild(document.createTextNode(text));
    td = L.DomUtil.create('div', 'mapbox-directions-step-distance', row);
    td.appendChild(document.createTextNode(distance));
    return row;
  }
});

module.exports = function(options) {
  return new ItineraryBuilder(options);
};

},{}]},{},[3])
//@ sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi9ob21lL3BhdHJpY2svQ29kZS9vc3JtLWZyb250ZW5kMi9zcmMvZGlyZWN0aW9uc190aGVtZS5qcyIsIi9ob21lL3BhdHJpY2svQ29kZS9vc3JtLWZyb250ZW5kMi9zcmMvZ2VvY29kZXIuanMiLCIvaG9tZS9wYXRyaWNrL0NvZGUvb3NybS1mcm9udGVuZDIvc3JjL2luZGV4LmpzIiwiL2hvbWUvcGF0cmljay9Db2RlL29zcm0tZnJvbnRlbmQyL3NyYy9pdGluZXJhcnlfYnVpbGRlci5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBpdGluZXJhcnlCdWlsZGVyID0gcmVxdWlyZSgnLi9pdGluZXJhcnlfYnVpbGRlci5qcycpO1xudmFyIGNyZWF0ZUdlb2NvZGVyID0gcmVxdWlyZSgnLi9nZW9jb2Rlci5qcycpO1xuXG52YXIgb3B0aW9ucyA9IHtcbiAgICByb3V0ZVdoaWxlRHJhZ2dpbmc6IHRydWUsXG4gICAgYWRkV2F5cG9pbnRzOiBmYWxzZSxcbiAgICB3YXlwb2ludE1vZGU6ICdzbmFwJyxcbiAgICBwb2ludE1hcmtlclN0eWxlOiB7XG4gICAgICByYWRpdXM6IDcsXG4gICAgICBjb2xvcjogJ3doaXRlJyxcbiAgICAgIGZpbGxDb2xvcjogJyMzQkIyRDAnLFxuICAgICAgb3BhY2l0eTogMSxcbiAgICAgIGZpbGxPcGFjaXR5OiAwLjcsXG4gICAgICB3ZWlnaHQ6IDEsXG4gICAgfSxcbiAgICBsaW5lT3B0aW9uczoge1xuICAgICAgc3R5bGVzOiBbXG4gICAgICAgIHtjb2xvcjogJ2JsYWNrJywgb3BhY2l0eTogMC4zNSwgd2VpZ2h0OiA3fSxcbiAgICAgICAge2NvbG9yOiAnd2hpdGUnLCBvcGFjaXR5OiAwLjgsIHdlaWdodDogNX0sXG4gICAgICAgIHtjb2xvcjogJyMzQkIyRDAnLCBvcGFjaXR5OiAxLCB3ZWlnaHQ6IDN9XG4gICAgICBdLFxuICAgIH0sXG4gICAgZHJhZ1N0eWxlczogW1xuICAgICAge2NvbG9yOiAnYmxhY2snLCBvcGFjaXR5OiAwLjE1LCB3ZWlnaHQ6IDd9LFxuICAgICAge2NvbG9yOiAnd2hpdGUnLCBvcGFjaXR5OiAwLjMsIHdlaWdodDogNH0sXG4gICAgICB7Y29sb3I6ICcjM0JCMkQwJywgb3BhY2l0eTogMSwgd2VpZ2h0OiAyLCBkYXNoQXJyYXk6ICc3LDEyJ31cbiAgICBdLFxuICAgIGNvbnRhaW5lckNsYXNzTmFtZTogXCJkYXJrIHBhZDJcIixcbiAgICBhbHRlcm5hdGl2ZUNsYXNzTmFtZTogXCJtYXBib3gtZGlyZWN0aW9ucy1pbnN0cnVjdGlvbnNcIixcbiAgICBzdGVwQ2xhc3NOYW1lOiBcIm1hcGJveC1kaXJlY3Rpb25zLXN0ZXBcIixcbiAgICBnZW9jb2RlcnNDbGFzc05hbWU6IFwibWFwYm94LWRpcmVjdGlvbnMtaW5wdXRzXCIsXG4gICAgY3JlYXRlR2VvY29kZXI6IGNyZWF0ZUdlb2NvZGVyLFxuICAgIGl0aW5lcmFyeUJ1aWxkZXI6IGl0aW5lcmFyeUJ1aWxkZXIoe2NvbnRhaW5lckNsYXNzTmFtZTogXCJtYXBib3gtZGlyZWN0aW9ucy1zdGVwc1wifSksXG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgb3B0aW9uczogb3B0aW9ucyxcbiAgLy8gdGhpcyBoaWRlcyB0aGUgc2lkZWJhciBiZWZvcmUgdGhlIGZpcnN0IHJvdXRlXG4gIHNldHVwOiBmdW5jdGlvbihscm0pIHtcbiAgICAgIGxybS5oaWRlKCk7XG4gICAgICBscm0ub24oJ3JvdXRlc2VsZWN0ZWQnLCBmdW5jdGlvbihyKSB7IGxybS5zaG93KCk7IH0pO1xuICAgIH1cbn07XG5cbiIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgZ2VvY29kZXIgPSBmdW5jdGlvbihpLCBudW0pIHtcbiAgdmFyIGNvbnRhaW5lciA9IEwuRG9tVXRpbC5jcmVhdGUoJ2RpdicsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChpID09PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gXCJtYXBib3gtZGlyZWN0aW9ucy1vcmlnaW5cIjtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGkgPT09IG51bS0xKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gXCJtYXBib3gtZGlyZWN0aW9ucy1kZXN0aW5hdGlvblwiO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gXCJtYXBib3gtZGlyZWN0aW9ucy12aWFcIjtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSgpKSxcbiAgICAgIGxhYmVsID0gTC5Eb21VdGlsLmNyZWF0ZSgnbGFiZWwnLCAnbWFwYm94LWZvcm0tbGFiZWwnLCBjb250YWluZXIpLFxuICAgICAgaW5wdXQgPSBMLkRvbVV0aWwuY3JlYXRlKCdpbnB1dCcsICcnLCBjb250YWluZXIpLFxuICAgICAgY2xvc2UgPSBMLkRvbVV0aWwuY3JlYXRlKCdzcGFuJywgJ21hcGJveC1kaXJlY3Rpb25zLWljb24gbWFwYm94LWNsb3NlLWljb24nLCBjb250YWluZXIpLFxuICAgICAgaWNvbixcbiAgICAgIGljb25OYW1lO1xuICBpZiAoaSA9PT0gMCkge1xuICAgIGljb25OYW1lID0gXCJkZXBhcnRcIjtcbiAgfSBlbHNlIGlmIChpID09PSBudW0tMSl7XG4gICAgaWNvbk5hbWUgPSBcImFycml2ZVwiO1xuICB9IGVsc2Uge1xuICAgIGljb25OYW1lID0gXCJ2aWFcIjtcbiAgfVxuICBpY29uICA9IEwuRG9tVXRpbC5jcmVhdGUoJ2RpdicsICdtYXBib3gtZGlyZWN0aW9ucy1pY29uIG1hcGJveC0nICsgaWNvbk5hbWUgICsgJy1pY29uJywgbGFiZWwpO1xuICBMLkRvbUV2ZW50Lm9uKGNsb3NlLCAnY2xpY2snLCBmdW5jdGlvbihlKSB7XG4gICAgaW5wdXQudmFsdWUgPSBcIlwiO1xuICB9KTtcblxuICByZXR1cm4ge1xuICAgIGNvbnRhaW5lcjogY29udGFpbmVyLFxuICAgIGlucHV0OiBpbnB1dCxcbiAgfTtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gZ2VvY29kZXI7XG5cbiIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgaXRpbmVyYXJ5QnVpbGRlciA9IHJlcXVpcmUoJy4vaXRpbmVyYXJ5X2J1aWxkZXIuanMnKTtcbnZhciBjcmVhdGVHZW9jb2RlciA9IHJlcXVpcmUoJy4vZ2VvY29kZXIuanMnKTtcbnZhciB0aGVtZSA9IHJlcXVpcmUoJy4vZGlyZWN0aW9uc190aGVtZS5qcycpO1xuXG52YXIgbWFwYm94ID0gTC50aWxlTGF5ZXIoJ2h0dHBzOi8ve3N9LnRpbGVzLm1hcGJveC5jb20vdjMvZGVubmlzbC40ZTJhYWI3Ni97en0ve3h9L3t5fS5wbmcnLFxuICAgIHthdHRyaWJ1dGlvbjogJyZjb3B5OyA8YSBocmVmPVwiaHR0cDovL21hcGJveC5jb20vXCI+TWFwQm94PC9hPiAmY29weTsgPGEgaHJlZj1cImh0dHA6Ly9vc20ub3JnL2NvcHlyaWdodFwiPk9wZW5TdHJlZXRNYXA8L2E+IGNvbnRyaWJ1dG9ycyd9XG4gICAgKTtcblxudmFyIG1hcCA9IEwubWFwKCdtYXAnLCB7bGF5ZXJzOiBbbWFwYm94XSwgem9vbUNvbnRyb2w6IGZhbHNlfSkuc2V0VmlldyhbNDguODQsIDEwLjEwXSwgNSk7XG5cbnZhciBiYXNlTWFwcyA9IHtcbiAgJ01hcGJveCc6IG1hcGJveCxcbn07XG5MLmNvbnRyb2wubGF5ZXJzKGJhc2VNYXBzKS5hZGRUbyhtYXApO1xuXG52YXIgb3B0aW9ucyA9IEwuZXh0ZW5kKHtcbiAgICBnZW9jb2RlcjogTC5Db250cm9sLkdlb2NvZGVyLm5vbWluYXRpbSgpLFxuICAgIHJvdXRlV2hpbGVEcmFnZ2luZzogdHJ1ZSxcbiAgICBhZGRXYXlwb2ludHM6IGZhbHNlLFxuICAgIHdheXBvaW50TW9kZTogJ3NuYXAnLFxufSwgdGhlbWUub3B0aW9ucyk7XG5cbnZhciBscm0gPSBMLlJvdXRpbmcuY29udHJvbChvcHRpb25zKTtcbmxybS5hZGRUbyhtYXApO1xuXG50aGVtZS5zZXR1cChscm0pO1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbi8qXG4gKiBDcmVhdHMgYSBpdGluZXJhcnkgY29udGFpbmVyIHRoYXQgY29udGFpbnMgdGhlIGluc3RydWN0aW9ucy5cbiAqIFRoaXMgd2lsbCBvdmVycmlkZSB0aGUgTFJNIGludGVybmFsIGJ1aWxkIHRoYXQgdXNlcyBhIHRhYmxlIGFzIGNvbnRhaW5lci5cbiAqIEhvd2V2ZXIgdXNpbmcgYSB0YWJsZSBkb2VzIG5vdCB3b3JrIHdpdGggb3VyIHRoZW1lLlxuICovXG52YXIgSXRpbmVyYXJ5QnVpbGRlciA9IEwuQ2xhc3MuZXh0ZW5kKHtcbiAgb3B0aW9uczoge1xuICAgIGNvbnRhaW5lckNsYXNzTmFtZTogJydcbiAgfSxcblxuICBpbml0aWFsaXplOiBmdW5jdGlvbihvcHRpb25zKSB7XG4gICAgTC5zZXRPcHRpb25zKHRoaXMsIG9wdGlvbnMpO1xuICB9LFxuXG4gIGNyZWF0ZUNvbnRhaW5lcjogZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIEwuRG9tVXRpbC5jcmVhdGUoJ2RpdicsIHRoaXMub3B0aW9ucy5jb250YWluZXJDbGFzc05hbWUpO1xuICB9LFxuXG4gIGNyZWF0ZVN0ZXBzQ29udGFpbmVyOiBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gTC5Eb21VdGlsLmNyZWF0ZSgnb2wnLCAnJyk7XG4gIH0sXG5cbiAgY3JlYXRlU3RlcDogZnVuY3Rpb24odGV4dCwgZGlzdGFuY2UsIGljb24sIHN0ZXBzKSB7XG4gICAgdmFyIHJvdyA9IEwuRG9tVXRpbC5jcmVhdGUoJ2xpJywgJ21hcGJveC1kaXJlY3Rpb25zLXN0ZXAnLCBzdGVwcyksXG4gICAgICAgIHRkO1xuXG4gICAgTC5Eb21VdGlsLmNyZWF0ZSgnc3BhbicsICdtYXBib3gtZGlyZWN0aW9ucy1pY29uIG1hcGJveC0nK2ljb24rJy1pY29uJywgcm93KTtcbiAgICB0ZCA9IEwuRG9tVXRpbC5jcmVhdGUoJ2RpdicsICdtYXBib3gtZGlyZWN0aW9ucy1zdGVwLW1hbmV1dmVyJywgcm93KTtcbiAgICB0ZC5hcHBlbmRDaGlsZChkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZSh0ZXh0KSk7XG4gICAgdGQgPSBMLkRvbVV0aWwuY3JlYXRlKCdkaXYnLCAnbWFwYm94LWRpcmVjdGlvbnMtc3RlcC1kaXN0YW5jZScsIHJvdyk7XG4gICAgdGQuYXBwZW5kQ2hpbGQoZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUoZGlzdGFuY2UpKTtcbiAgICByZXR1cm4gcm93O1xuICB9XG59KTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihvcHRpb25zKSB7XG4gIHJldHVybiBuZXcgSXRpbmVyYXJ5QnVpbGRlcihvcHRpb25zKTtcbn07XG4iXX0=
(3)
});
;