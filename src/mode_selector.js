'use strict';

var L = require('leaflet');

// Simple line drawings share one stroke weight and remain legible without colour.
var PROFILE_PATHS = {
  driving: '<path d="m5 9 2-5h10l2 5M4 9h16v9H4zM7 18v2m10-2v2M7 13h1m8 0h1"/>',
  bike: '<circle cx="6" cy="16" r="4"/><circle cx="18" cy="16" r="4"/><path d="m6 16 5-9 7 9H6l-3-9h5m6-3h3l1 4"/>',
  foot: '<circle cx="14" cy="4" r="2"/><path d="m12 8-3 5-4 1m7-6 4 5 4 1m-8-6-1 8-5 6m5-6 5 3 1 4"/>'
};

function createModeSelector(localization, profiles) {
  if (!profiles || profiles.length === 0) return null;

  function getProfileLabel(profile, strings) {
    var key = profile.labelKey || profile.label;
    return strings[key] || key;
  }

  var container = L.DomUtil.create('span', 'leaflet-osrm-mode-selector');
  container.setAttribute('role', 'group');
  // Keep the select as the internal change-event interface used by routing,
  // overlays and entrance filtering. The visible controls are native buttons.
  var profileSelect = L.DomUtil.create('select', 'osrm-profile-chooser', container);
  profileSelect.hidden = true;
  profileSelect.tabIndex = -1;
  profileSelect.setAttribute('aria-hidden', 'true');
  var buttons = [];
  var labels = [];
  L.DomEvent.disableClickPropagation(container);

  function setValue(value) {
    profileSelect.value = String(value);
    buttons.forEach(function(button, index) {
      button.setAttribute('aria-pressed', String(profileSelect.value === String(index)));
    });
  }

  profiles.forEach(function(profile, index) {
    var option = L.DomUtil.create('option', 'fill-osrm', profileSelect);
    option.value = index;
    var button = L.DomUtil.create('button', 'osrm-profile-button', container);
    button.type = 'button';
    var path = PROFILE_PATHS[profile.profile];
    if (path) {
      var icon = L.DomUtil.create('span', 'osrm-profile-icon', button);
      icon.setAttribute('aria-hidden', 'true');
      icon.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + path + '</svg>';
    }
    labels.push(L.DomUtil.create('span', 'osrm-profile-label', button));
    buttons.push(button);
    L.DomEvent.on(button, 'click', function() {
      if (profileSelect.value === String(index)) return;
      setValue(index);
      profileSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
    });
  });

  function updateLocalization(strings) {
    var title = strings['Select profile'] || 'Select profile';
    container.setAttribute('aria-label', title);
    profileSelect.title = title;
    profiles.forEach(function(profile, index) {
      var label = getProfileLabel(profile, strings);
      profileSelect.options[index].textContent = label;
      buttons[index].title = label;
      buttons[index].setAttribute('aria-label', label);
      labels[index].textContent = label;
    });
  }

  L.DomEvent.on(profileSelect, 'change', function() {
    setValue(profileSelect.value);
  });
  setValue(0);
  updateLocalization(localization);
  return { container: container, select: profileSelect, setValue: setValue, updateLocalization: updateLocalization };
}

module.exports = { createModeSelector: createModeSelector };
