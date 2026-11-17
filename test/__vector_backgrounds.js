'use strict';

const { createLayer } = require('../src/vector_layer');

module.exports = {
  createBackgrounds: (style, options) => ({
    vector: createLayer(style, options),
    streets: createLayer(style, Object.assign({}, options, { theme: 'original' })),
    satelliteStreets: { options: { overlayBaseLayer: options.satelliteLayer } }
  })
};
