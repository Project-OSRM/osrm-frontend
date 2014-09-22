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
