'use strict';

function transformRequest(url) {
  if (/^https:\/\/vector\.openstreetmap\.org\//.test(url)) {
    // Keep the browser's real User-Agent and HTTP cache. Never add cache
    // busters or no-cache headers to provider tile URLs.
    return { url: url, cache: 'default', referrerPolicy: 'strict-origin-when-cross-origin' };
  }
  return { url: url };
}

module.exports = { transformRequest: transformRequest };
