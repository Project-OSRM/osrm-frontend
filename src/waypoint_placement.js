'use strict';

/**
 * Given the current waypoints array, determine which slot a new map-click
 * waypoint should fill.
 *
 * Returns an action object { index, deleteCount } or null when the click
 * should be ignored (source and target are both already set and no modifier
 * key is held).
 *
 * @param {Array} waypoints - array of { latLng } objects (latLng may be null)
 * @param {boolean} modifierPressed - whether Ctrl/Meta is held
 * @returns {{ index: number, deleteCount: number } | null}
 */
function resolveWaypointSlot(waypoints, modifierPressed) {
  var sourceAndTargetSet = waypoints.length >= 2 &&
    waypoints[0].latLng &&
    waypoints[waypoints.length - 1].latLng;

  if (sourceAndTargetSet && !modifierPressed) {
    return null;
  }

  if (sourceAndTargetSet && modifierPressed) {
    // Insert a via-point before the last waypoint (the target).
    return { index: waypoints.length - 1, deleteCount: 0 };
  }

  // Find the first empty waypoint slot.
  // Counting filled waypoints and deriving the index from that breaks when
  // only the destination is pre-filled via URL (?loc=&loc=<dest>): the single
  // filled point sits at index 1, so the old code overwrote the destination
  // instead of filling the empty start at index 0.
  var emptyIndex = -1;
  for (var i = 0; i < waypoints.length; i++) {
    if (!waypoints[i].latLng) {
      emptyIndex = i;
      break;
    }
  }

  if (emptyIndex !== -1) {
    return { index: emptyIndex, deleteCount: 1 };
  }

  // All slots are filled: replace the last one.
  return { index: Math.max(0, waypoints.length - 1), deleteCount: 1 };
}

module.exports = { resolveWaypointSlot: resolveWaypointSlot };
