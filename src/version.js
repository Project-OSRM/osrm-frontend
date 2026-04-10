'use strict';

module.exports = {
  buildTimestamp: typeof __BUILD_TIMESTAMP__ !== 'undefined' ? __BUILD_TIMESTAMP__ : 'unknown',
  getVersionInfo: function() {
    return {
      timestamp: this.buildTimestamp,
      formatted: this.formatTimestamp(this.buildTimestamp)
    };
  },
  formatTimestamp: function(timestamp) {
    if (timestamp === 'unknown') return 'unknown';
    try {
      var date = new Date(timestamp);
      return date.toLocaleString();
    } catch (e) {
      return timestamp;
    }
  }
};
