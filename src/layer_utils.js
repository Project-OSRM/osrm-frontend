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

module.exports = { handleBaselayerChange: handleBaselayerChange };
