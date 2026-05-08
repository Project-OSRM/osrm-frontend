"use strict";

module.exports = {
  buildTimestamp:
    typeof __BUILD_TIMESTAMP__ !== "undefined"
      ? __BUILD_TIMESTAMP__
      : "unknown",
  getVersionInfo: function () {
    return {
      timestamp: this.buildTimestamp,
      formatted: this.formatTimestamp(this.buildTimestamp),
    };
  },
  formatTimestamp: function (timestamp) {
    if (timestamp === "unknown") return "unknown";
    var date = new Date(timestamp);
    if (isNaN(date.getTime())) {
      return timestamp;
    }
    return date.toLocaleString();
  },
};
