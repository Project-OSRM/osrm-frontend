'use strict';

// Helper to handle baselayer changes: persist to local storage and update state
function handleBaselayerChange(e, ls, state) {
  if (!e) return;
  var layerName = e.name;
  try {
    if (ls && typeof ls.set === 'function') ls.set('layer', layerName);
  } catch (err) {
    // ignore localStorage errors
  }
  try {
    if (typeof state !== 'undefined' && state && state.options) {
      state.options.layer = layerName;
      if (typeof state.update === 'function') state.update();
    }
  } catch (err) {
    // Do not let state update failures break the handler
    console.error('Error updating state after baselayer change:', err);
  }
}

module.exports = { handleBaselayerChange: handleBaselayerChange };
