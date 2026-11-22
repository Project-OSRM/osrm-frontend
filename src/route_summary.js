'use strict';

function escapeText(value) {
  return String(value === null || value === undefined ? '' : value).replace(/[&<>"']/g, function(character) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
  });
}

function routeSummary(data) {
  return '<div class="osrm-directions-summary">' +
    '<p class="osrm-route-time">' + escapeText(data.time) + '</p>' +
    '<p class="osrm-route-distance">' + escapeText(data.distance) + '</p>' +
    '<h2 class="osrm-route-name">' + escapeText(data.name) + '</h2></div>';
}

module.exports = routeSummary;
