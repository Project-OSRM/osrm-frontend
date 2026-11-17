'use strict';

function rectangleDistance(x, y, left, top, right, bottom) {
  var dx = Math.abs(x - (left + right) / 2) - (right - left) / 2;
  var dy = Math.abs(y - (top + bottom) / 2) - (bottom - top) / 2;
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0);
}

function segmentDistance(x, y, x1, y1, x2, y2) {
  var vx = x2 - x1, vy = y2 - y1;
  var projection = Math.max(0, Math.min(1, ((x - x1) * vx + (y - y1) * vy) / (vx * vx + vy * vy)));
  return Math.hypot(x - x1 - projection * vx, y - y1 - projection * vy) - 1;
}

function fuelDistance(x, y) {
  var pump = Math.max(rectangleDistance(x, y, 7, 6, 18, 25), -rectangleDistance(x, y, 9, 8, 16, 14));
  return Math.min(pump, rectangleDistance(x, y, 5, 24, 20, 27),
    segmentDistance(x, y, 18, 13, 21, 15), segmentDistance(x, y, 21, 15, 21, 22),
    segmentDistance(x, y, 21, 22, 25, 22), segmentDistance(x, y, 25, 22, 25, 11),
    segmentDistance(x, y, 21, 7, 25, 11));
}

function lodgingDistance(x, y) {
  return Math.min(rectangleDistance(x, y, 5, 10, 7, 27), rectangleDistance(x, y, 5, 19, 27, 23),
    rectangleDistance(x, y, 25, 19, 27, 27), rectangleDistance(x, y, 14, 13, 26, 20),
    Math.hypot(x - 10, y - 15) - 3);
}

function imageDefinition(id) {
  var distance = id === 'osrm-poi-fuel' ? fuelDistance : id === 'osrm-poi-lodging' ? lodgingDistance : null;
  if (!distance) return null;
  var width = 32, height = 32, data = new Uint8Array(width * height * 4);
  for (var y = 0; y < height; y++) {
    for (var x = 0; x < width; x++) {
      // MapLibre SDF icons use the 0.75 contour for their visible edge. Keeping
      // the distance field lets icon-color adapt these symbols to either palette.
      var alpha = Math.round(255 * Math.max(0, Math.min(1, 0.75 - distance(x + 0.5, y + 0.5) / 8)));
      data.set([255, 255, 255, alpha], (y * width + x) * 4);
    }
  }
  return { image: { width: width, height: height, data: data }, options: { pixelRatio: 1, sdf: true } };
}

module.exports = { imageDefinition: imageDefinition };
