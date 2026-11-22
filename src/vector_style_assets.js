'use strict';

// Sprite URLs must be absolute in MapLibre. Resolve local style assets against
// the style file so the same bundle works at the site root or in a subdirectory.
module.exports = function(style, styleUrl) {
  if (!style.sprite) return style;
  var sprite = Array.isArray(style.sprite) ? style.sprite.map(function(entry) {
    return Object.assign({}, entry, { url: new URL(entry.url, styleUrl).href });
  }) : new URL(style.sprite, styleUrl).href;
  return Object.assign({}, style, { sprite: sprite });
};
