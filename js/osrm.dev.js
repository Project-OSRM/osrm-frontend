!function(e){"object"==typeof exports?module.exports=e():"function"==typeof define&&define.amd?define(e):"undefined"!=typeof window?window.osrm=e():"undefined"!=typeof global?global.osrm=e():"undefined"!=typeof self&&(self.osrm=e())}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
"use strict";

var mapbox = L.tileLayer('https://{s}.tiles.mapbox.com/v3/dennisl.4e2aab76/{z}/{x}/{y}.png',
    {attribution: '&copy; <a href="http://mapbox.com/">MapBox</a> &copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'}
    );
/*
var osm = L.tileLayer('http://{s}.tile.osm.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="http://mapbox.com/">MapBox</a> &copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
    });
*/

var map = L.map('map', {
  layers: [/*osm, */mapbox],
  zoomControl: false,
  }).setView([48.84, 10.10], 5);

var baseMaps = {
//  'OSM' : osm,
  'Mapbox': mapbox,
};

L.control.layers(baseMaps).addTo(map);

var lrm = L.Routing.control({
    geocoder: L.Control.Geocoder.nominatim(),
    routeWhileDragging: true,
    addWaypoints: false,
    waypointMode: 'snap',
    pointMarkerStyle: {
      radius: 5,
      color: '#03f',
      fillColor: 'white',
      opacity: 1,
      fillOpacity: 0.7
    },
    geocoderClass: function(i, num) {
      if (i === 0) {
        return "mapbox-directions-origin";
      } else if (i === num-1) {
        return "mapbox-directions-destination";
      }

      return "mapbox-directions-via";
      },
    itineraryClassName: "mapbox-directions-steps",
    containerClassName: "dark pad2",
    alternativeClassName: "mapbox-directions-instructions",
    stepClassName: "mapbox-directions-step",
    geocodersClassName: "mapbox-directions-inputs",
    geocoderSetup: function(geocoder, i, num, input) {
      var label = L.DomUtil.create('label', 'mapbox-form-label'),
          close = L.DomUtil.create('span', 'mapbox-directions-icon mapbox-close-icon'),
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
      geocoder.appendChild(label);
      geocoder.appendChild(input);
      geocoder.appendChild(close);
    },
    itineraryFormatter: {
      createContainer: function(className) {
        return L.DomUtil.create('div', className);
      },

      createStepsContainer: function(container) {
        return L.DomUtil.create('ol', '', container);
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
      },
    },
});
lrm.addTo(map);
lrm.hide();
lrm.on('routeselected', function(r) { lrm.show(); });

},{}]},{},[1])
//@ sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi9ob21lL3BhdHJpY2svQ29kZS9vc3JtLWZyb250ZW5kMi9zcmMvaW5kZXguanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyJcInVzZSBzdHJpY3RcIjtcblxudmFyIG1hcGJveCA9IEwudGlsZUxheWVyKCdodHRwczovL3tzfS50aWxlcy5tYXBib3guY29tL3YzL2Rlbm5pc2wuNGUyYWFiNzYve3p9L3t4fS97eX0ucG5nJyxcbiAgICB7YXR0cmlidXRpb246ICcmY29weTsgPGEgaHJlZj1cImh0dHA6Ly9tYXBib3guY29tL1wiPk1hcEJveDwvYT4gJmNvcHk7IDxhIGhyZWY9XCJodHRwOi8vb3NtLm9yZy9jb3B5cmlnaHRcIj5PcGVuU3RyZWV0TWFwPC9hPiBjb250cmlidXRvcnMnfVxuICAgICk7XG4vKlxudmFyIG9zbSA9IEwudGlsZUxheWVyKCdodHRwOi8ve3N9LnRpbGUub3NtLm9yZy97en0ve3h9L3t5fS5wbmcnLCB7XG4gICAgYXR0cmlidXRpb246ICcmY29weTsgPGEgaHJlZj1cImh0dHA6Ly9tYXBib3guY29tL1wiPk1hcEJveDwvYT4gJmNvcHk7IDxhIGhyZWY9XCJodHRwOi8vb3NtLm9yZy9jb3B5cmlnaHRcIj5PcGVuU3RyZWV0TWFwPC9hPiBjb250cmlidXRvcnMnXG4gICAgfSk7XG4qL1xuXG52YXIgbWFwID0gTC5tYXAoJ21hcCcsIHtcbiAgbGF5ZXJzOiBbLypvc20sICovbWFwYm94XSxcbiAgem9vbUNvbnRyb2w6IGZhbHNlLFxuICB9KS5zZXRWaWV3KFs0OC44NCwgMTAuMTBdLCA1KTtcblxudmFyIGJhc2VNYXBzID0ge1xuLy8gICdPU00nIDogb3NtLFxuICAnTWFwYm94JzogbWFwYm94LFxufTtcblxuTC5jb250cm9sLmxheWVycyhiYXNlTWFwcykuYWRkVG8obWFwKTtcblxudmFyIGxybSA9IEwuUm91dGluZy5jb250cm9sKHtcbiAgICBnZW9jb2RlcjogTC5Db250cm9sLkdlb2NvZGVyLm5vbWluYXRpbSgpLFxuICAgIHJvdXRlV2hpbGVEcmFnZ2luZzogdHJ1ZSxcbiAgICBhZGRXYXlwb2ludHM6IGZhbHNlLFxuICAgIHdheXBvaW50TW9kZTogJ3NuYXAnLFxuICAgIHBvaW50TWFya2VyU3R5bGU6IHtcbiAgICAgIHJhZGl1czogNSxcbiAgICAgIGNvbG9yOiAnIzAzZicsXG4gICAgICBmaWxsQ29sb3I6ICd3aGl0ZScsXG4gICAgICBvcGFjaXR5OiAxLFxuICAgICAgZmlsbE9wYWNpdHk6IDAuN1xuICAgIH0sXG4gICAgZ2VvY29kZXJDbGFzczogZnVuY3Rpb24oaSwgbnVtKSB7XG4gICAgICBpZiAoaSA9PT0gMCkge1xuICAgICAgICByZXR1cm4gXCJtYXBib3gtZGlyZWN0aW9ucy1vcmlnaW5cIjtcbiAgICAgIH0gZWxzZSBpZiAoaSA9PT0gbnVtLTEpIHtcbiAgICAgICAgcmV0dXJuIFwibWFwYm94LWRpcmVjdGlvbnMtZGVzdGluYXRpb25cIjtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIFwibWFwYm94LWRpcmVjdGlvbnMtdmlhXCI7XG4gICAgICB9LFxuICAgIGl0aW5lcmFyeUNsYXNzTmFtZTogXCJtYXBib3gtZGlyZWN0aW9ucy1zdGVwc1wiLFxuICAgIGNvbnRhaW5lckNsYXNzTmFtZTogXCJkYXJrIHBhZDJcIixcbiAgICBhbHRlcm5hdGl2ZUNsYXNzTmFtZTogXCJtYXBib3gtZGlyZWN0aW9ucy1pbnN0cnVjdGlvbnNcIixcbiAgICBzdGVwQ2xhc3NOYW1lOiBcIm1hcGJveC1kaXJlY3Rpb25zLXN0ZXBcIixcbiAgICBnZW9jb2RlcnNDbGFzc05hbWU6IFwibWFwYm94LWRpcmVjdGlvbnMtaW5wdXRzXCIsXG4gICAgZ2VvY29kZXJTZXR1cDogZnVuY3Rpb24oZ2VvY29kZXIsIGksIG51bSwgaW5wdXQpIHtcbiAgICAgIHZhciBsYWJlbCA9IEwuRG9tVXRpbC5jcmVhdGUoJ2xhYmVsJywgJ21hcGJveC1mb3JtLWxhYmVsJyksXG4gICAgICAgICAgY2xvc2UgPSBMLkRvbVV0aWwuY3JlYXRlKCdzcGFuJywgJ21hcGJveC1kaXJlY3Rpb25zLWljb24gbWFwYm94LWNsb3NlLWljb24nKSxcbiAgICAgICAgICBpY29uLFxuICAgICAgICAgIGljb25OYW1lO1xuICAgICAgaWYgKGkgPT09IDApIHtcbiAgICAgICAgaWNvbk5hbWUgPSBcImRlcGFydFwiO1xuICAgICAgfSBlbHNlIGlmIChpID09PSBudW0tMSl7XG4gICAgICAgIGljb25OYW1lID0gXCJhcnJpdmVcIjtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGljb25OYW1lID0gXCJ2aWFcIjtcbiAgICAgIH1cbiAgICAgIGljb24gID0gTC5Eb21VdGlsLmNyZWF0ZSgnZGl2JywgJ21hcGJveC1kaXJlY3Rpb25zLWljb24gbWFwYm94LScgKyBpY29uTmFtZSAgKyAnLWljb24nLCBsYWJlbCk7XG4gICAgICBMLkRvbUV2ZW50Lm9uKGNsb3NlLCAnY2xpY2snLCBmdW5jdGlvbihlKSB7XG4gICAgICAgIGlucHV0LnZhbHVlID0gXCJcIjtcbiAgICAgIH0pO1xuICAgICAgZ2VvY29kZXIuYXBwZW5kQ2hpbGQobGFiZWwpO1xuICAgICAgZ2VvY29kZXIuYXBwZW5kQ2hpbGQoaW5wdXQpO1xuICAgICAgZ2VvY29kZXIuYXBwZW5kQ2hpbGQoY2xvc2UpO1xuICAgIH0sXG4gICAgaXRpbmVyYXJ5Rm9ybWF0dGVyOiB7XG4gICAgICBjcmVhdGVDb250YWluZXI6IGZ1bmN0aW9uKGNsYXNzTmFtZSkge1xuICAgICAgICByZXR1cm4gTC5Eb21VdGlsLmNyZWF0ZSgnZGl2JywgY2xhc3NOYW1lKTtcbiAgICAgIH0sXG5cbiAgICAgIGNyZWF0ZVN0ZXBzQ29udGFpbmVyOiBmdW5jdGlvbihjb250YWluZXIpIHtcbiAgICAgICAgcmV0dXJuIEwuRG9tVXRpbC5jcmVhdGUoJ29sJywgJycsIGNvbnRhaW5lcik7XG4gICAgICB9LFxuXG4gICAgICBjcmVhdGVTdGVwOiBmdW5jdGlvbih0ZXh0LCBkaXN0YW5jZSwgaWNvbiwgc3RlcHMpIHtcbiAgICAgICAgdmFyIHJvdyA9IEwuRG9tVXRpbC5jcmVhdGUoJ2xpJywgJ21hcGJveC1kaXJlY3Rpb25zLXN0ZXAnLCBzdGVwcyksXG4gICAgICAgIHRkO1xuICAgICAgICBMLkRvbVV0aWwuY3JlYXRlKCdzcGFuJywgJ21hcGJveC1kaXJlY3Rpb25zLWljb24gbWFwYm94LScraWNvbisnLWljb24nLCByb3cpO1xuICAgICAgICB0ZCA9IEwuRG9tVXRpbC5jcmVhdGUoJ2RpdicsICdtYXBib3gtZGlyZWN0aW9ucy1zdGVwLW1hbmV1dmVyJywgcm93KTtcbiAgICAgICAgdGQuYXBwZW5kQ2hpbGQoZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUodGV4dCkpO1xuICAgICAgICB0ZCA9IEwuRG9tVXRpbC5jcmVhdGUoJ2RpdicsICdtYXBib3gtZGlyZWN0aW9ucy1zdGVwLWRpc3RhbmNlJywgcm93KTtcbiAgICAgICAgdGQuYXBwZW5kQ2hpbGQoZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUoZGlzdGFuY2UpKTtcbiAgICAgICAgcmV0dXJuIHJvdztcbiAgICAgIH0sXG4gICAgfSxcbn0pO1xubHJtLmFkZFRvKG1hcCk7XG5scm0uaGlkZSgpO1xubHJtLm9uKCdyb3V0ZXNlbGVjdGVkJywgZnVuY3Rpb24ocikgeyBscm0uc2hvdygpOyB9KTtcbiJdfQ==
(1)
});
;