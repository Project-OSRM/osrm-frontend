'use strict';

/**
 * Decides whether to switch from the current route to a different alternative
 * based on a desired index (e.g. read from URL state on initial page load).
 *
 * The LRM always selects route[0] first.  If the caller wants a different
 * alternative, this function returns the re-arranged event payload so the
 * caller can re-fire `routeselected` with the correct route.
 *
 * @param {Object}  route        – the currently selected route (must have .routesIndex)
 * @param {Array}   alternatives – other route objects (may be empty / undefined)
 * @param {*}       desiredAlt   – the 0-based index of the desired alternative
 * @returns {Object|null}        – {route, alternatives} to re-fire, or null when
 *                                 no switch is needed (desiredAlt is 0, missing,
 *                                 already matches, or out of bounds)
 */
module.exports = function resolveInitialAlternative(route, alternatives, desiredAlt) {
  var index = Number(desiredAlt);
  if (!index || index < 0 || index % 1 !== 0) return null;  // 0, NaN, undefined, null, "", negative, non-integer
  if (route.routesIndex === index) return null; // already on the desired route

  var allRoutes = [route].concat(alternatives || []);
  if (index >= allRoutes.length) return null;   // desiredAlt no longer exists

  return {
    route: allRoutes[index],
    alternatives: allRoutes.filter(function(_, i) {
      return i !== index;
    })
  };
};
