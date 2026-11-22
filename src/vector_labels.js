'use strict';

function languageCodes(language) {
  if (typeof language !== 'string' || !/^[a-z]{2,3}(?:[-_][a-z0-9]{2,8})*$/i.test(language)) return [];
  var parts = language.replace(/_/g, '-').split('-').map(function(part, index) {
    if (!index) return part.toLowerCase();
    if (part.length === 4) return part[0].toUpperCase() + part.slice(1).toLowerCase();
    return part.length === 2 ? part.toUpperCase() : part.toLowerCase();
  });
  var codes = [];
  while (parts.length) {
    codes.push(parts.join('-'));
    parts.pop();
  }
  return codes;
}

function localizedTextField(field, language) {
  var codes = languageCodes(language);
  var name = codes.length ? ['case'] : ['get', 'name'];
  codes.forEach(function(code) {
    var key = 'name_' + code;
    name.push(['all', ['has', key], ['!=', ['get', key], '']], ['get', key]);
  });
  if (codes.length) name.push(['coalesce', ['get', 'name'], '']);
  function replace(expression) {
    if (!Array.isArray(expression) || expression[0] === 'literal') return expression;
    if (expression.length === 2 && expression[0] === 'get' && expression[1] === 'name') return name;
    var values = expression.map(replace);
    return values.some(function(value, index) {
      return value !== expression[index];
    }) ? values : expression;
  }
  return field === '{name}' ? name : replace(field);
}

function localizeStyle(style, language) {
  return Object.assign({}, style, { layers: style.layers.map(function(layer) {
    if (layer.type !== 'symbol' || !layer.layout) return layer;
    var field = localizedTextField(layer.layout['text-field'], language);
    if (field === layer.layout['text-field']) return layer;
    return Object.assign({}, layer, { layout: Object.assign({}, layer.layout, { 'text-field': field }) });
  }) });
}

function applyLanguage(map, original, language) {
  original.layers.forEach(function(layer) {
    if (layer.type !== 'symbol' || !layer.layout) return;
    var field = localizedTextField(layer.layout['text-field'], language);
    if (field !== layer.layout['text-field']) map.setLayoutProperty(layer.id, 'text-field', field);
  });
}

function configureRenderer(renderer, currentStyle) {
  var language = 'en';
  var updatePending = false;
  renderer.setLanguage = function(nextLanguage) {
    nextLanguage = nextLanguage || 'en';
    if (language === nextLanguage) return;
    language = nextLanguage;
    var map = renderer.getMaplibreMap();
    var style = currentStyle();
    if (!map || !style) return;
    function apply() {
      updatePending = false;
      var latestStyle = currentStyle();
      if (renderer.getMaplibreMap() === map && latestStyle) applyLanguage(map, latestStyle, language);
    }
    // Names can change as soon as the style layers exist, even while tiles are
    // loading. The map's initial "load" event does not repeat after a pan.
    if (map.isStyleLoaded() || style.layers.length && map.getLayer && map.getLayer(style.layers[0].id)) apply();
    else if (!updatePending) {
      updatePending = true;
      map.once('style.load', apply);
    }
  };
  return function() {
    return language;
  };
}

module.exports = { localizedTextField: localizedTextField, localizeStyle: localizeStyle, applyLanguage: applyLanguage, configureRenderer: configureRenderer };
