'use strict';

var resolveAssets = require('./vector_style_assets');
var pendingStyles = new Map();

function preloadSprites(styleUrl) {
  var suffix = window.devicePixelRatio > 1 ? '@2x' : '';
  ['.json', '.png'].forEach(function(extension) {
    var href = new URL('sprites' + suffix + extension, styleUrl).href;
    if (Array.prototype.some.call(document.querySelectorAll('link[data-osrm-sprite-preload]'), function(link) {
      return link.href === href;
    })) return;
    var link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'fetch';
    link.crossOrigin = 'anonymous';
    link.href = href;
    link.setAttribute('data-osrm-sprite-preload', '');
    document.head.appendChild(link);
  });
}

function loadBundledStyle(styleUrl) {
  if (pendingStyles.has(styleUrl)) return pendingStyles.get(styleUrl);
  // Only the bundled, selected vector map uses this early path. Sprites are
  // local assets; viewport tile selection remains entirely with MapLibre.
  preloadSprites(styleUrl);
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
