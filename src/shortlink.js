"use strict";

var corslite = require("@mapbox/corslite");
var PUBLIC_FRONTEND_URL = "https://map.project-osrm.org/";

function isLoopbackHostname(hostname) {
  return (
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]"
  );
}

function getShareableUrl(url) {
  var parsedUrl, publicUrl;
  try {
    parsedUrl = new URL(url);
  } catch (error) {
    return url;
  }

  if (!isLoopbackHostname(parsedUrl.hostname)) {
    return url;
  }

  publicUrl = new URL(PUBLIC_FRONTEND_URL);
  publicUrl.pathname = parsedUrl.pathname;
  publicUrl.search = parsedUrl.search;
  publicUrl.hash = parsedUrl.hash;
  return publicUrl.toString();
}

module.exports = {
  osmli: function (url, callback) {
    var encodedUrl = encodeURIComponent(getShareableUrl(url));
    corslite(
      "https://osm.li/get?url=" + encodedUrl,
      function (err, response) {
        var data, responseText;
        if (err || !response) {
          callback("");
          return;
        }
        responseText = response.responseText || response.response;
        if (!responseText) {
          callback("");
          return;
        }
        try {
          data = JSON.parse(responseText);
        } catch (error) {
          callback("");
          return;
        }
        callback((data && data.ShortURL) || "");
      },
      true,
    );
  },
  getShareableUrl: getShareableUrl,
};
