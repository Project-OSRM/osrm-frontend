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
 * @param {boolean} hasStoredSatelliteStreets – Saved Satellite street-overlay preference.
 * @returns {{ layers: object|Array, bikeOverlayAutoActivated: boolean }}
 */
function determineInitialLayers(baselayer, overlay, services, profileIndex, hasStoredOverlay, hasStoredSatelliteStreets) {
  var profile = services[profileIndex] && services[profileIndex].profile;

  var layers = [baselayer];
  if (hasStoredSatelliteStreets && overlay['Street overlay']) layers.push(overlay['Street overlay']);
  if (hasStoredOverlay && overlay['Small Components']) layers.push(overlay['Small Components']);
  var bike = profile === 'bike' && !!overlay.Bike;
  if (bike) layers.push(overlay.Bike);
  return { layers: layers, bikeOverlayAutoActivated: bike };
}

module.exports = { determineInitialLayers: determineInitialLayers };
