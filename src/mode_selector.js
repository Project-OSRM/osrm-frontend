"use strict";

var L = require("leaflet");

function createModeSelector(localization, profiles) {
  if (!profiles || profiles.length === 0) {
    return null;
  }

  function getProfileLabel(profile, activeLocalization) {
    var labelKey = profile.labelKey || profile.label;
    return activeLocalization[labelKey] || labelKey;
  }

  var container = L.DomUtil.create("span", "leaflet-osrm-mode-selector");
  var profileSelect = L.DomUtil.create(
    "select",
    "osrm-profile-chooser",
    container,
  );
  profileSelect.setAttribute(
    "title",
    localization["Select profile"] || "Select profile",
  );
  // Allow opening the native select dropdown while preventing events from bubbling to parent map controls
  L.DomEvent.on(profileSelect, "mousedown", L.DomEvent.stopPropagation);
  L.DomEvent.on(profileSelect, "click", L.DomEvent.stopPropagation);
  L.DomEvent.on(profileSelect, "touchstart", L.DomEvent.stopPropagation);

  profiles.forEach(function (profile, index) {
    var option = L.DomUtil.create("option", "fill-osrm", profileSelect);
    option.setAttribute("value", index);
    var profileLabel = getProfileLabel(profile, localization);
    option.appendChild(document.createTextNode(profileLabel));
    if (index === 0) {
      option.setAttribute("selected", "");
    }
  });

  return {
    container: container,
    select: profileSelect,
    updateLocalization: function (newLocalization) {
      profileSelect.setAttribute(
        "title",
        newLocalization["Select profile"] || "Select profile",
      );
      Array.from(profileSelect.options).forEach(function (option, index) {
        if (profiles[index]) {
          option.textContent = getProfileLabel(
            profiles[index],
            newLocalization,
          );
        }
      });
    },
  };
}

module.exports = {
  createModeSelector: createModeSelector,
};
