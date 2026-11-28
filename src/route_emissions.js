'use strict';

// COPERT hot emissions for a medium Euro 6 d/e petrol car, sampled in
// OSRM backend PR #7821. Each point pairs km/h with grams of CO₂ per km.
// https://github.com/Project-OSRM/osrm-backend/pull/7821
var curve = [
  [5, 320.2], [10, 261.4], [15, 223.7], [20, 197.8], [30, 165.5],
  [40, 147.2], [50, 136.7], [60, 131], [70, 128.5], [80, 128.6],
  [90, 130.7], [100, 134.6], [110, 140.2], [120, 147.6], [130, 156.6]
];
var idleGramsPerSecond = 0.5;
var ferryGramsPerKm = 250;

function gramsPerKm(speed) {
  if (speed <= curve[0][0]) return curve[0][1];
  for (var i = 1; i < curve.length; i++) {
    var lower = curve[i - 1];
    var upper = curve[i];
    if (speed <= upper[0]) {
      return lower[1] + (upper[1] - lower[1]) * (speed - lower[0]) / (upper[0] - lower[0]);
    }
  }
  return curve[curve.length - 1][1];
}

function nonnegative(value) {
  return Number.isFinite(value) && value >= 0;
}

function estimateGrams(route) {
  if (!route || !Array.isArray(route.legs) || !route.legs.length) return null;

  // Step speeds approximate the model's per-segment speeds. Step durations
  // include delays during movement, so only standalone waits use the idle rate.
  var totalGrams = 0;
  var hasDistance = false;
  for (var i = 0; i < route.legs.length; i++) {
    var leg = route.legs[i];
    if (!leg || !Array.isArray(leg.steps) || !leg.steps.length) return null;
    for (var j = 0; j < leg.steps.length; j++) {
      var step = leg.steps[j];
      if (!step || !nonnegative(step.distance) || !nonnegative(step.duration)) return null;
      if (!step.distance && !step.duration) continue;
      if (step.mode === 'ferry' || step.mode === 'train') {
        totalGrams += step.distance / 1000 * ferryGramsPerKm;
      } else if (step.mode === 'driving') {
        totalGrams += step.distance ?
          step.distance / 1000 * gramsPerKm(step.distance / step.duration * 3.6) :
          step.duration * idleGramsPerSecond;
      } else {
        return null;
      }
      hasDistance = hasDistance || step.distance > 0;
    }
  }
  return hasDistance && Number.isFinite(totalGrams) ? totalGrams : null;
}

function lowestEmissions(routes) {
  if (routes.length < 2) return null;
  var estimates = routes.map(function(route) {
    return route && route.estimatedEmissionsGrams;
  });
  if (!estimates.every(nonnegative)) return null;

  var minimum = Math.min.apply(Math, estimates);
  var lowest = estimates.indexOf(minimum);
  // Ignore floating-point noise when different step boundaries sum to the same estimate.
  if (estimates.some(function(value, index) {
    return index !== lowest && value - minimum < 0.000001;
  })) return null;

  return { index: lowest, savings: lowest === 0 ? null : (estimates[0] - minimum) / estimates[0] };
}

module.exports = { estimateGrams: estimateGrams, lowestEmissions: lowestEmissions };
