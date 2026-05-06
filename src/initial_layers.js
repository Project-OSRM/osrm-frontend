'use strict';

/**
 * Determine the initial map layers based on the active profile and stored
 * overlay preference.
 *
 * @param {object}  baselayer        – The base tile layer to use.
 * @param {object}  overlay          – Map of overlay name → tile layer.
 * @param {Array}   services         – Available routing services/profiles.
 * @param {number}  profileIndex     – Index into `services` for the active profile.
 * @param {boolean} hasStoredOverlay – Whether localStorage indicates an overlay was active.
 * @returns {{ layers: object|Array, bikeOverlayAutoActivated: boolean }}
 */
function determineInitialLayers(baselayer, overlay, services, profileIndex, hasStoredOverlay) {
  var profile = services[profileIndex] && services[profileIndex].profile;

  if (profile === 'bike' && overlay['Bike']) {
    return { layers: [baselayer, overlay['Bike']], bikeOverlayAutoActivated: true };
  }

  if (hasStoredOverlay) {
    return { layers: [baselayer, overlay['Small Components']], bikeOverlayAutoActivated: false };
  }

  return { layers: [baselayer], bikeOverlayAutoActivated: false };
}

module.exports = { determineInitialLayers: determineInitialLayers };
