'use strict';

var LOCATION_TIMEOUT_MS = 60000;

function attach(map, control) {
  var acquisitionTimer;

  function clearAcquisitionTimer() {
    clearTimeout(acquisitionTimer);
  }

  map.on('locateactivate', function() {
    clearAcquisitionTimer();
    // LocateControl keeps watching after a fix and tolerates watch timeouts.
    // Limit the initial request separately, even while permission is pending.
    acquisitionTimer = setTimeout(function() {
      if (!control.getContainer().classList.contains('requesting')) return;
      control.stop();
      control.options.onLocationError({ code: 3, message: 'Location request timed out.' }, control);
    }, LOCATION_TIMEOUT_MS);
  });
  map.on('locatelocationfound locatedeactivate unload', clearAcquisitionTimer);
}

module.exports = { attach: attach, timeout: LOCATION_TIMEOUT_MS };
