"use strict";

module.exports = L.Map.extend({
    fitBounds: function(bounds, options) {
        var lrmContainer = document.querySelector('.leaflet-routing-container'),
            geocoderContainer = document.querySelector('.leaflet-routing-geocoders'),
            rightPadding = lrmContainer.getBoundingClientRect().width,
            topPadding = geocoderContainer.getBoundingClientRect().bottom;

        return L.Map.prototype.fitBounds.call(this, bounds, L.extend({
            paddingTopLeft: [0, topPadding],
            paddingBottomRight: [rightPadding, 0]
        }, options));
    }
});
