'use strict';

var L = require('leaflet');

function normalizeExclude(value) {
  if (typeof value !== 'string') return '';
  return value.split(',').map(function(entry) {
    return entry.trim();
  }).filter(function(entry, index, entries) {
    return entry && entries.indexOf(entry) === index;
  }).join(',');
}

function normalize(preferences) {
  preferences = preferences || {};
  return {
    exclude: normalizeExclude(preferences.exclude),
    allowUTurns: preferences.allowUTurns === true
  };
}

function applyToRouter(router, preferences) {
  var values = normalize(preferences);
  var parameters = Object.assign({}, router.options.requestParameters, {
    continue_straight: !values.allowUTurns
  });
  if (values.exclude) parameters.exclude = values.exclude;
  else delete parameters.exclude;
  router.options.requestParameters = parameters;
}

function createControl(localization, initial, onChange) {
  var container = L.DomUtil.create('details', 'osrm-route-preferences');
  var summary = L.DomUtil.create('summary', '', container);
  var excludeLabel = L.DomUtil.create('label', '', container);
  var excludeText = L.DomUtil.create('span', '', excludeLabel);
  var excludeInput = L.DomUtil.create('input', '', excludeLabel);
  excludeInput.type = 'text';
  excludeInput.autocomplete = 'off';
  excludeInput.spellcheck = false;
  var help = L.DomUtil.create('small', '', excludeLabel);
  var uturnLabel = L.DomUtil.create('label', '', container);
  var uturnInput = L.DomUtil.create('input', '', uturnLabel);
  uturnInput.type = 'checkbox';
  var uturnText = L.DomUtil.create('span', '', uturnLabel);
  L.DomEvent.disableClickPropagation(container);

  function set(preferences) {
    var values = normalize(preferences);
    excludeInput.value = values.exclude;
    uturnInput.checked = values.allowUTurns;
  }

  function notifyChange() {
    var values = normalize({ exclude: excludeInput.value, allowUTurns: uturnInput.checked });
    set(values);
    onChange(values);
  }

  function updateLocalization(strings) {
    summary.textContent = strings['Route options'] || 'Route options';
    excludeText.textContent = strings['Exclude road classes'] || 'Exclude road classes';
    excludeInput.placeholder = 'motorway,toll,ferry';
    help.textContent = strings['Road classes depend on the routing backend.'] || 'Road classes depend on the routing backend.';
    uturnText.textContent = strings['Allow U-turns at via points'] || 'Allow U-turns at via points';
  }

  L.DomEvent.on(excludeInput, 'change', notifyChange);
  L.DomEvent.on(uturnInput, 'change', notifyChange);
  set(initial);
  updateLocalization(localization);
  return { container: container, set: set, updateLocalization: updateLocalization };
}

module.exports = { normalize: normalize, applyToRouter: applyToRouter, createControl: createControl };
