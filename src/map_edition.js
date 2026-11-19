'use strict';

var linkLabels = {
  classic: { en: 'Back to the classic demo site', de: 'Zurück zur klassischen Demo' },
  new: { en: 'Try the new demo site', de: 'Neue Demo ausprobieren' }
};

function switchUrl(destination, search, routingDefault) {
  var url = new URL(destination);
  var params = new URLSearchParams(search);
  // Each edition uses its own default basemap.
  params.delete('ly');
  if (!params.has('u')) params.set('u', routingDefault);
  params.set('view', 'keep');
  url.search = params.toString();
  return url.href;
}

function attach(doc, location, getState, format, routingDefault) {
  var config = doc.querySelector('meta[name="osrm-map-switch"]');
  if (!config || !config.content) return null;
  if (config.dataset.host && config.dataset.host !== location.hostname) return null;
  if (!Object.hasOwn(linkLabels, config.dataset.edition)) return null;
  var labels = linkLabels[config.dataset.edition];
  var destination = new URL(config.content, location.href);
  if (destination.origin !== location.origin || destination.pathname === location.pathname) return null;

  var link = doc.createElement('a');
  link.className = 'osrm-edition-switch';
  var update = function() {
    var state = getState();
    var language = String(state.language || 'en').split('-')[0].toLowerCase();
    link.textContent = Object.hasOwn(labels, language) ? labels[language] : labels.en;
    link.href = switchUrl(destination, format(state), routingDefault);
  };
  ['pointerenter', 'focus', 'contextmenu', 'click', 'auxclick'].forEach(function(event) {
    link.addEventListener(event, update);
  });
  update();
  doc.body.appendChild(link);
  return update;
}

function holdInitialView(enabled, plan, routing) {
  if (!enabled) {
    return function() {
      return false;
    };
  }
  var pending = true;
  function cancel() {
    pending = false;
    plan.off('waypointschanged', cancel);
    routing.off('routingerror', cancel);
  }
  plan.on('waypointschanged', cancel);
  routing.on('routingerror', cancel);
  return function consume() {
    var keepView = pending;
    cancel();
    return keepView;
  };
}

module.exports = { switchUrl: switchUrl, attach: attach, holdInitialView: holdInitialView };
