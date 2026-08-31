'use strict';

// Shared between a test and the mocked Leaflet marker, which cannot reach the
// test's own scope because jest.mock is hoisted above it.
var boxes = {};

module.exports = {
  set: function(map) { boxes = map || {}; },
  get: function(text) { return boxes[text] || null; },
  clear: function() { boxes = {}; }
};
