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

L.Routing.control({
    geocoder: L.Control.Geocoder.nominatim(),
    routeWhileDragging: true
}).addTo(map);


},{}]},{},[1])
//@ sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi9ob21lL3BhdHJpY2svQ29kZS9vc3JtLWZyb250ZW5kMi9zcmMvaW5kZXguanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyJcInVzZSBzdHJpY3RcIjtcblxudmFyIG1hcGJveCA9IEwudGlsZUxheWVyKCdodHRwczovL3tzfS50aWxlcy5tYXBib3guY29tL3YzL2Rlbm5pc2wuNGUyYWFiNzYve3p9L3t4fS97eX0ucG5nJyk7XG52YXIgb3NtID0gTC50aWxlTGF5ZXIoJ2h0dHA6Ly97c30udGlsZS5vc20ub3JnL3t6fS97eH0ve3l9LnBuZycsIHtcbiAgICBhdHRyaWJ1dGlvbjogJyZjb3B5OyA8YSBocmVmPVwiaHR0cDovL29zbS5vcmcvY29weXJpZ2h0XCI+T3BlblN0cmVldE1hcDwvYT4gY29udHJpYnV0b3JzJ1xuICAgIH0pO1xuXG52YXIgbWFwID0gTC5tYXAoJ21hcCcsIHtsYXllcnM6IFtvc20sIG1hcGJveF19KS5zZXRWaWV3KFs1MS41MDUsIC0wLjA5XSwgOCk7XG5cbnZhciBiYXNlTWFwcyA9IHtcbiAgJ09TTScgOiBvc20sXG4gICdNYXBib3gnOiBtYXBib3gsXG59O1xuXG5MLmNvbnRyb2wubGF5ZXJzKGJhc2VNYXBzKS5hZGRUbyhtYXApO1xuXG5MLlJvdXRpbmcuY29udHJvbCh7XG4gICAgZ2VvY29kZXI6IEwuQ29udHJvbC5HZW9jb2Rlci5ub21pbmF0aW0oKSxcbiAgICByb3V0ZVdoaWxlRHJhZ2dpbmc6IHRydWVcbn0pLmFkZFRvKG1hcCk7XG5cbiJdfQ==
(1)
});
;