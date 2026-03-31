'use strict';

const path = require('path');

module.exports = {
  entry: './src/index.js',
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, '.'),
    library: 'osrm',
    libraryTarget: 'umd'
  },
  mode: 'production',
  devtool: 'source-map',
  resolve: {
    fallback: {
      crypto: false,
      stream: false,
      buffer: false
    }
  }
};