'use strict';

var L = require('leaflet');
var localization = require('./localization');

function initialize(enabled) {
  document.documentElement.classList.toggle('osrm-theme-dark', !!enabled);
}

function routeLabelCoordinate(coordinates, fraction) {
  var valid = (coordinates || []).filter(function(coordinate) {
    return coordinate && isFinite(coordinate.lat) && isFinite(coordinate.lng);
  });
  return valid.length ? valid[Math.floor((valid.length - 1) * fraction)] : null;
}

function attach(options) {
  var map = options.map;
  var control = options.control;
  var tools = options.tools;
  var panel = control.getContainer();
  var alternatives = control._altContainer;
  var language = options.language;
  var selectedRoute;
  var labels = L.layerGroup().addTo(map);
  var resizeFrame;
  var header = L.DomUtil.create('header', 'osrm-panel-header');
  var title = L.DomUtil.create('h1', '', header);
  var actions = L.DomUtil.create('div', 'osrm-panel-actions', header);
  var collapse = panel.querySelector('.leaflet-routing-collapse-btn');
  panel.insertBefore(header, panel.firstChild);
  if (tools._shareContainer) actions.appendChild(tools._shareContainer);
  if (tools._shareButton) {
    tools._shareButton.classList.add('osrm-header-share-icon');
    tools._shareButton.setAttribute('role', 'button');
    tools._shareButton.tabIndex = 0;
    L.DomEvent.on(tools._shareButton, 'keydown', function(event) {
      if (event.key === 'Enter' || event.key === ' ') tools._toggleSharePopup(event);
    });
  }
  if (collapse) {
    actions.appendChild(collapse);
    collapse.setAttribute('role', 'button');
    collapse.tabIndex = 0;
    L.DomEvent.on(collapse, 'keydown', function(event) {
      if (event.key === 'Enter' || event.key === ' ') {
        L.DomEvent.stop(event);
        collapse.click();
      }
    });
  }
  var modeLabel;
  if (options.modeSelector) {
    var modeSection = L.DomUtil.create('div', 'osrm-mode-section');
    modeLabel = L.DomUtil.create('span', 'osrm-mode-caption', modeSection);
    modeSection.appendChild(options.modeSelector.container);
    panel.insertBefore(modeSection, header.nextSibling);
  }
  var addButton = panel.querySelector('.leaflet-routing-add-waypoint');
  var reverseButton = panel.querySelector('.leaflet-routing-reverse-waypoints');
  var toolbar = tools.getContainer && tools.getContainer();
  var toolbarFooter;
  if (toolbar) {
    toolbarFooter = L.DomUtil.create('nav', 'osrm-panel-toolbar');
    toolbarFooter.appendChild(toolbar);
    panel.insertBefore(toolbarFooter, header.nextSibling);
  }
  var status = 'Plan your route';

  function translate(key) {
    return localization.t(language, key);
  }

  function updatePanelSize() {
    if (collapse) collapse.setAttribute('aria-expanded', String(!panel.classList.contains('leaflet-routing-container-hide')));
    document.documentElement.style.setProperty('--osrm-panel-height', Math.ceil(panel.getBoundingClientRect().height) + 'px');
    if (resizeFrame !== undefined) L.Util.cancelAnimFrame(resizeFrame);
    resizeFrame = L.Util.requestAnimFrame(function() {
      resizeFrame = undefined;
      map.invalidateSize({ pan: false, debounceMoveend: true });
    });
  }

  function renderLabels() {
    labels.clearLayers();
    var routes = control._routes || [];
    var fastest = routes.reduce(function(time, route) {
      return route.summary ? Math.min(time, route.summary.totalTime) : time;
    }, Infinity);
    routes.forEach(function(route, index) {
      if (!alternatives.querySelector('.leaflet-routing-alt')) return;
      var position = routeLabelCoordinate(route.coordinates, [0.48, 0.68, 0.3][index % 3]);
      if (!position || !route.summary) return;
      var active = route === (selectedRoute || routes[0]);
      var card = alternatives.querySelectorAll('.leaflet-routing-alt')[index];
      var summary = card && card.querySelector('.osrm-directions-summary');
      if (summary) summary.setAttribute('aria-pressed', String(active));
      var content = L.DomUtil.create('div', 'osrm-route-label' + (active ? ' selected' : ''));
      var duration = L.DomUtil.create('strong', '', content);
      duration.textContent = control._formatter.formatTime(route.summary.totalTime);
      if (route.summary.totalTime === fastest) {
        var description = L.DomUtil.create('span', '', content);
        description.textContent = translate('Fastest');
      }
      var marker = L.marker(position, {
        icon: L.divIcon({ className: 'osrm-route-label-marker', html: content, iconSize: [0, 0], iconAnchor: [0, 0] }),
        title: duration.textContent + ' · ' + route.name,
        keyboard: true,
        zIndexOffset: active ? 800 : 700
      }).addTo(labels);
      marker.on('click', function() {
        control.fire('routeselected', {
          route: route,
          alternatives: routes.filter(function(alternative) {
            return alternative !== route;
          })
        });
      });
    });
  }

  function decorateRoutes() {
    var cards = Array.prototype.slice.call(alternatives.querySelectorAll('.leaflet-routing-alt'));
    var routes = control._routes || [];
    var fastest = routes.reduce(function(time, route) {
      return route.summary ? Math.min(time, route.summary.totalTime) : time;
    }, Infinity);
    cards.forEach(function(card, index) {
      var summary = card.querySelector('.osrm-directions-summary');
      if (!summary) return;
      summary.setAttribute('role', 'button');
      summary.tabIndex = 0;
      if (!summary.dataset.osrmKeyboard) {
        summary.dataset.osrmKeyboard = 'true';
        summary.addEventListener('keydown', function(event) {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            summary.click();
          }
        });
      }
      var badge = summary.querySelector('.osrm-route-badge') || L.DomUtil.create('span', 'osrm-route-badge', summary);
      badge.textContent = translate(routes[index] && routes[index].summary && routes[index].summary.totalTime === fastest ? 'Fastest' : 'Alternative');
      var table = card.querySelector('table');
      if (table && !card.querySelector('.osrm-turn-list')) {
        var details = L.DomUtil.create('details', 'osrm-turn-list');
        var instructionsTitle = L.DomUtil.create('summary', '', details);
        instructionsTitle.addEventListener('click', function(event) {
          event.stopPropagation();
        });
        table.parentNode.insertBefore(details, table);
        details.appendChild(table);
      }
      var detailsTitle = card.querySelector('.osrm-turn-list > summary');
      if (detailsTitle) detailsTitle.textContent = translate('Turn-by-turn directions');
    });
    var empty = alternatives.querySelector('.osrm-route-empty');
    if (!cards.length) {
      if (!empty) empty = L.DomUtil.create('div', 'osrm-route-empty', alternatives);
      var emptyTitle = empty.querySelector('h2') || L.DomUtil.create('h2', '', empty);
      var emptyText = empty.querySelector('p') || L.DomUtil.create('p', '', empty);
      emptyTitle.textContent = translate(status);
      emptyText.textContent = translate(status === 'Route unavailable' ? 'Try another waypoint or change your route options.' : 'Choose a start and destination, or click the map to add stops.');
    } else if (empty) {
      empty.remove();
    }
    renderLabels();
  }

  function updateLocalization(nextLanguage) {
    language = nextLanguage || language;
    title.textContent = translate('Directions');
    if (toolbarFooter) toolbarFooter.setAttribute('aria-label', translate('Map tools'));
    if (modeLabel) modeLabel.textContent = translate('Travel mode');
    if (collapse) {
      collapse.title = translate('Toggle directions');
      collapse.setAttribute('aria-label', collapse.title);
    }
    if (tools._shareButton) tools._shareButton.setAttribute('aria-label', translate('Share Route'));
    if (options.modeSelector) options.modeSelector.select.setAttribute('aria-label', translate('Select profile'));
    if (addButton) addButton.textContent = translate('Add stop');
    if (reverseButton) {
      reverseButton.title = translate('Reverse stops');
      reverseButton.setAttribute('aria-label', reverseButton.title);
    }
    decorateRoutes();
  }

  var routeObserver = new window.MutationObserver(decorateRoutes);
  routeObserver.observe(alternatives, { childList: true });
  var panelObserver = new window.MutationObserver(updatePanelSize);
  panelObserver.observe(panel, { attributes: true, attributeFilter: ['class'] });
  var resizeObserver;
  if (window.ResizeObserver) {
    resizeObserver = new window.ResizeObserver(updatePanelSize);
    resizeObserver.observe(panel);
  }
  L.DomEvent.on(window, 'resize', updatePanelSize);
  control.on('routeselected', function(event) {
    selectedRoute = event.route;
    renderLabels();
  });
  control.on('routingstart', function() {
    status = 'Finding route…';
    decorateRoutes();
  });
  control.on('routingerror', function() {
    status = 'Route unavailable';
    decorateRoutes();
  });
  tools.on('languagechanged', function(event) {
    updateLocalization(event.language);
  });
  map.on('unload', function() {
    routeObserver.disconnect();
    panelObserver.disconnect();
    if (resizeObserver) resizeObserver.disconnect();
    L.DomEvent.off(window, 'resize', updatePanelSize);
    if (resizeFrame !== undefined) L.Util.cancelAnimFrame(resizeFrame);
    labels.clearLayers();
  });
  updateLocalization(language);
  updatePanelSize();
  return { updateLocalization: updateLocalization, decorateRoutes: decorateRoutes, labels: labels };
}

module.exports = { initialize: initialize, attach: attach, routeLabelCoordinate: routeLabelCoordinate };
