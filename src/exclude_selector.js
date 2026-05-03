'use strict';

var L = require('leaflet');

function createExcludeSelector(localization, classes, initial) {
  classes = classes || ['motorway', 'ferry', 'toll'];
  initial = initial || [];

  var container = L.DomUtil.create('span', 'leaflet-osrm-exclude-selector');
  var select = L.DomUtil.create('select', 'osrm-exclude-chooser', container);
  select.setAttribute('multiple', '');
  select.setAttribute('title', (localization && localization['Exclude classes']) || 'Exclude classes');

  // Prevent map interactions when interacting with the select
  L.DomEvent.on(select, 'mousedown', L.DomEvent.stopPropagation);
  L.DomEvent.on(select, 'click', L.DomEvent.stopPropagation);
  L.DomEvent.on(select, 'touchstart', L.DomEvent.stopPropagation);

  classes.forEach(function(cls) {
    var option = L.DomUtil.create('option', '', select);
    option.value = cls;
    option.appendChild(document.createTextNode(cls));
    if (initial.indexOf(cls) >= 0) {
      option.setAttribute('selected', '');
    }
  });

  function getSelected() {
    return Array.from(select.options)
      .filter(function(o) {
        return o.selected;
      })
      .map(function(o) {
        return o.value;
      });
  }

  function setSelected(values) {
    values = values || [];
    Array.from(select.options).forEach(function(o) {
      o.selected = values.indexOf(o.value) >= 0;
    });
  }

  function onChange(cb) {
    L.DomEvent.on(select, 'change', function() {
      cb && cb(getSelected());
    });
  }

  return {
    container: container,
    select: select,
    getSelected: getSelected,
    setSelected: setSelected,
    onChange: onChange
  };
}

module.exports = {
  createExcludeSelector: createExcludeSelector
};