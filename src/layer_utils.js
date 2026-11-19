'use strict';

// Helper to handle baselayer changes: persist to local storage and update state
// opts: { userInitiated: boolean }
function handleBaselayerChange(e, ls, state, opts) {
  if (!e) return;
  var layerName = e.name;
  var userInitiated = opts && !!opts.userInitiated;

  // Persist to localStorage only when change was initiated by the user via the UI
  try {
    if (userInitiated && ls && typeof ls.set === 'function') ls.set('layer', layerName);
  } catch (err) {
    // ignore localStorage errors
  }

  try {
    if (typeof state !== 'undefined' && state && state.options) {
      state.options.layer = layerName;
      // Update the URL/state only for user-initiated changes so links don't overwrite stored prefs
      if (userInitiated && typeof state.update === 'function') state.update();
    }
  } catch (err) {
    // Do not let state update failures break the handler
    console.error('Error updating state after baselayer change:', err);
  }
}

function resolveLayerByName(layers, name) {
  if (!layers || !name) return undefined;
  if (layers[name]) return layers[name];
  var lower = String(name).toLowerCase();
  var keys = Object.keys(layers);
  var exact = keys.find(function(key) {
    return key.toLowerCase() === lower;
  });
  if (exact) return layers[exact];
  var dark = layers['Dark Vector'] || layers.Standard;
  if (lower === 'standard' || lower === 'vector') return dark;
  if (lower === 'streets') return dark || layers.OpenStreetMap;
  if (lower === 'openstreetmap.org' || lower === 'osm.org' || lower === 'openstreetmap') return layers.OpenStreetMap || layers['openstreetmap.org'];
  if (lower === 'osm.de') return layers['OpenStreetMap.de'] || layers['openstreetmap.de'];
  return Object.values(layers).find(function(layer) {
    return layer && layer.options && layer.options.id === name;
  });
}

module.exports = { handleBaselayerChange: handleBaselayerChange, resolveLayerByName: resolveLayerByName };
