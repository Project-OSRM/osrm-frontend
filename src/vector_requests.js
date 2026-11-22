'use strict';

function transformRequest(url) {
  if (/^https:\/\/vector\.openstreetmap\.org\//.test(url)) {
    // Keep the browser's real User-Agent and HTTP cache. Never add cache
    // busters or no-cache headers to provider tile URLs.
    return { url: url, cache: 'default', referrerPolicy: 'strict-origin-when-cross-origin' };
  }
  return { url: url };
}

function withBundledSprites(assets, addProtocol) {
  if (!assets) return transformRequest;
  var protocol = 'osrm-sprite';
  var prefix = protocol + '://';
  addProtocol(protocol, function(request) {
    return assets.requests.get(decodeURIComponent(request.url.slice(prefix.length)));
  });
  return function(url, type) {
    var pending = (type === 'SpriteJSON' || type === 'SpriteImage') && assets.requests.get(url);
    if (!pending) return transformRequest(url);
    return pending.then(function(resource) {
      return resource ? { url: prefix + encodeURIComponent(url) } : transformRequest(url);
    });
  };
}

module.exports = { transformRequest: transformRequest, withBundledSprites: withBundledSprites };
