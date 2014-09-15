!function(e){"object"==typeof exports?module.exports=e():"function"==typeof define&&define.amd?define(e):"undefined"!=typeof window?window.osrm=e():"undefined"!=typeof global?global.osrm=e():"undefined"!=typeof self&&(self.osrm=e())}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
"use strict";

var mapbox = L.tileLayer('https://{s}.tiles.mapbox.com/v3/dennisl.4e2aab76/{z}/{x}/{y}.png');
var osm = L.tileLayer('http://{s}.tile.osm.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
    });

var map = L.map('map', {layers: [osm, mapbox]}).setView([51.505, -0.09], 8);

var baseMaps = {
  'OSM' : osm,
  'Mapbox': mapbox,
};

L.control.layers(baseMaps).addTo(map);

//L.Routing.control({
//waypoints: [
//L.latLng(57.74, 11.94),
//L.latLng(57.6792, 11.949)
//],
//geocoder: L.Control.Geocoder.nominatim()
//}).addTo(map);


L.Routing.control({
    // Geocoder is optional here
    geocoder: L.Control.Geocoder.nominatim()
}).addTo(map);

},{}]},{},[1])
//@ sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi9ob21lL3BhdHJpY2svQ29kZS9vc3JtLWZyb250ZW5kMi9zcmMvaW5kZXguanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBtYXBib3ggPSBMLnRpbGVMYXllcignaHR0cHM6Ly97c30udGlsZXMubWFwYm94LmNvbS92My9kZW5uaXNsLjRlMmFhYjc2L3t6fS97eH0ve3l9LnBuZycpO1xudmFyIG9zbSA9IEwudGlsZUxheWVyKCdodHRwOi8ve3N9LnRpbGUub3NtLm9yZy97en0ve3h9L3t5fS5wbmcnLCB7XG4gICAgYXR0cmlidXRpb246ICcmY29weTsgPGEgaHJlZj1cImh0dHA6Ly9vc20ub3JnL2NvcHlyaWdodFwiPk9wZW5TdHJlZXRNYXA8L2E+IGNvbnRyaWJ1dG9ycydcbiAgICB9KTtcblxudmFyIG1hcCA9IEwubWFwKCdtYXAnLCB7bGF5ZXJzOiBbb3NtLCBtYXBib3hdfSkuc2V0VmlldyhbNTEuNTA1LCAtMC4wOV0sIDgpO1xuXG52YXIgYmFzZU1hcHMgPSB7XG4gICdPU00nIDogb3NtLFxuICAnTWFwYm94JzogbWFwYm94LFxufTtcblxuTC5jb250cm9sLmxheWVycyhiYXNlTWFwcykuYWRkVG8obWFwKTtcblxuLy9MLlJvdXRpbmcuY29udHJvbCh7XG4vL3dheXBvaW50czogW1xuLy9MLmxhdExuZyg1Ny43NCwgMTEuOTQpLFxuLy9MLmxhdExuZyg1Ny42NzkyLCAxMS45NDkpXG4vL10sXG4vL2dlb2NvZGVyOiBMLkNvbnRyb2wuR2VvY29kZXIubm9taW5hdGltKClcbi8vfSkuYWRkVG8obWFwKTtcblxuXG5MLlJvdXRpbmcuY29udHJvbCh7XG4gICAgLy8gR2VvY29kZXIgaXMgb3B0aW9uYWwgaGVyZVxuICAgIGdlb2NvZGVyOiBMLkNvbnRyb2wuR2VvY29kZXIubm9taW5hdGltKClcbn0pLmFkZFRvKG1hcCk7XG4iXX0=
(1)
});
;