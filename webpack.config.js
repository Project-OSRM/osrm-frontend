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
  devServer: {
    static: {
      directory: path.join(__dirname, '.'),
    },
    compress: true,
    port: 9000,
  },
  resolve: {
    fallback: {
      crypto: false,
      stream: false,
      buffer: false
    }
  }
};