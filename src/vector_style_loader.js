'use strict';

var resolveAssets = require('./vector_style_assets');
var pendingStyles = new Map();

function loadBundledStyle(styleUrl) {
  if (pendingStyles.has(styleUrl)) return pendingStyles.get(styleUrl);
  if (window.osrmBundledSprites) window.osrmBundledSprites.start(styleUrl);
  var pending = window.fetch(styleUrl, { cache: 'default', referrerPolicy: 'strict-origin-when-cross-origin' }).then(function(response) {
    if (!response.ok) throw new Error('Vector style could not load (HTTP ' + response.status + ').');
    return response.json();
  }).then(function(style) {
    return resolveAssets(style, styleUrl);
  }).catch(function(error) {
    pendingStyles.delete(styleUrl);
    throw error;
  });
  pendingStyles.set(styleUrl, pending);
  return pending;
}

module.exports = { loadBundledStyle: loadBundledStyle };
