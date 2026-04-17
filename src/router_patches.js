'use strict';

// TODO: remove this patch once the upstream bug is fixed in leaflet-routing-machine.
// Upstream issue: https://github.com/perliedman/leaflet-routing-machine/issues/719
//
// _leftOrRight defaults anything not containing 'left' to 'Right', so an
// 'on ramp straight' step incorrectly renders a right-turn arrow (osrm-frontend#255).
// This replacement preserves non-directional modifiers like 'straight'.
function leftOrRight(d) {
  if (!d) return d;
  if (d.indexOf('left') >= 0) return 'Left';
  if (d.indexOf('right') >= 0) return 'Right';
  return d;
}

module.exports = {
  applyPatches: function(router) {
    router._leftOrRight = leftOrRight;
  },
  // Exported for unit testing
  leftOrRight: leftOrRight
};
