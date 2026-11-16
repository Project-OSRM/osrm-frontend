'use strict';

function metric(route, name) {
  var value = route && route.summary && route.summary[name];
  return typeof value === 'number' && isFinite(value) && value >= 0 ? value : null;
}

function turnCount(route) {
  if (!route || !Array.isArray(route.instructions) || !route.instructions.length) return null;
  return route.instructions.filter(function(instruction) {
    if (!instruction) return false;
    return /^(?:(?:Slight|Sharp)?(?:Left|Right)|Roundabout|Uturn|TurnAround)$/.test(instruction.type) ||
      /^(?:Merge|Fork|OnRamp|OffRamp|EndOfRoad)$/.test(instruction.type) && /Left|Right/.test(instruction.modifier);
  }).length;
}

// These comparisons describe the routes OSRM returned, not a globally shortest
// path. Similar arrival assumes the same departure: at most 5% slower, with a
// one-minute floor and a three-minute ceiling to keep the label meaningful.
function describeRoutes(routes) {
  var times = routes.map(function(route) {
    return metric(route, 'totalTime');
  });
  var distances = routes.map(function(route) {
    return metric(route, 'totalDistance');
  });
  var turns = routes.map(turnCount);
  var validTimes = times.filter(function(value) {
    return value !== null;
  });
  var validDistances = distances.filter(function(value) {
    return value !== null;
  });
  var comparableTimes = validTimes.length === routes.length;
  var fastest = Math.min.apply(Math, validTimes);
  var shortest = Math.min.apply(Math, validDistances);
  var similarTime = Math.max(60, Math.min(180, fastest * 0.05));
  var differentDistances = validDistances.length === routes.length && validDistances.length > 1 && Math.max.apply(Math, validDistances) - shortest > 1;
  var fewerTurns = turns.length > 1 && turns.every(function(value) {
    return value !== null;
  }) &&
    Math.max.apply(Math, turns) > Math.min.apply(Math, turns);
  return routes.map(function(route, index) {
    var badges = [];
    if (comparableTimes && times[index] !== null && times[index] <= fastest + 1) badges.push('Fastest');
    if (differentDistances && distances[index] !== null && distances[index] <= shortest + 1) badges.push('Shortest');
    if (comparableTimes && times[index] !== null && times[index] > fastest + 1 && times[index] - fastest <= similarTime) badges.push('Similar arrival time');
    if (fewerTurns && turns[index] === Math.min.apply(Math, turns)) badges.push('Fewer turns');
    return badges.length ? badges : ['Alternative'];
  });
}

module.exports = { describeRoutes: describeRoutes };
