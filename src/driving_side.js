'use strict';

// Which side of the road traffic keeps at a location, answered offline by
// gauche-rs: the OSM driving-side polygons compiled into a WebAssembly module.
// The itinerary needs this to draw a U-turn the way it is actually driven.
//
// The gauche-rs module is passed in rather than required here so the logic can
// be exercised with a stand-in; the real module is ESM plus a .wasm fetch.

var LEFT = 'left';
var RIGHT = 'right';

// Return values of gauche-rs' classify functions.
var RIGHT_HAND_TRAFFIC = 0;
var LEFT_HAND_TRAFFIC = 1;

function createDrivingSideClassifier(gauche) {
  var ready = false;
  var loading = null;

  return {
    // Fetches and instantiates the WebAssembly module. Resolves once
    // classifyPoint can answer; repeated calls share the first load.
    load: function(wasmUrl) {
      if (!loading) {
        loading = Promise.resolve()
          .then(function() {
            return gauche.init(wasmUrl);
          })
          .then(function() {
            ready = true;
          });
      }
      return loading;
    },

    isReady: function() {
      return ready;
    },

    // 'left' or 'right', or undefined while the module is still loading or
    // when gauche-rs cannot classify the location.
    classifyPoint: function(lat, lng) {
      if (!ready) return undefined;
      var result = gauche.classifyPoint(lat, lng);
      if (result === LEFT_HAND_TRAFFIC) return LEFT;
      if (result === RIGHT_HAND_TRAFFIC) return RIGHT;
      return undefined;
    }
  };
}

// The driving side at an OSRM route step's maneuver. gauche-rs decides when it
// is loaded; until then the backend's own driving_side stands in, and a backend
// too old to report one leaves the side unknown.
function stepDrivingSide(step, classifier) {
  var location = step && step.maneuver && step.maneuver.location;
  if (classifier && location && location.length >= 2) {
    // OSRM locations are [longitude, latitude].
    var side = classifier.classifyPoint(location[1], location[0]);
    if (side) return side;
  }
  if (step && (step.driving_side === LEFT || step.driving_side === RIGHT)) {
    return step.driving_side;
  }
  return undefined;
}

module.exports = {
  LEFT: LEFT,
  RIGHT: RIGHT,
  createDrivingSideClassifier: createDrivingSideClassifier,
  stepDrivingSide: stepDrivingSide
};
