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

function polygonDistance(x, y, points) {
  var distance = Infinity, inside = false;
  for (var i = 0, previous = points.length - 1; i < points.length; previous = i++) {
    var a = points[i], b = points[previous];
    distance = Math.min(distance, segmentDistance(x, y, a[0], a[1], b[0], b[1]) + 1);
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside ? -distance : distance;
}

function ferryDistance(x, y) {
  var cabin = Math.max(rectangleDistance(x, y, 9, 9, 23, 18), -rectangleDistance(x, y, 11, 11, 21, 15));
  return Math.min(cabin, rectangleDistance(x, y, 14, 5, 17, 10),
    polygonDistance(x, y, [[5, 18], [27, 18], [22, 25], [10, 25]]),
    segmentDistance(x, y, 5, 28, 10, 27), segmentDistance(x, y, 10, 27, 16, 28),
    segmentDistance(x, y, 16, 28, 22, 27), segmentDistance(x, y, 22, 27, 27, 28));
}

function helipadDistance(x, y) {
  return Math.min(Math.abs(Math.hypot(x - 16, y - 16) - 11) - 1,
    rectangleDistance(x, y, 10, 10, 12, 22), rectangleDistance(x, y, 20, 10, 22, 22),
    rectangleDistance(x, y, 12, 15, 20, 17));
}

function cableCarDistance(x, y) {
  var cabin = Math.max(rectangleDistance(x, y, 7, 12, 25, 26),
    -rectangleDistance(x, y, 9, 14, 15, 20), -rectangleDistance(x, y, 17, 14, 23, 20));
  return Math.min(cabin, segmentDistance(x, y, 4, 6, 28, 6), segmentDistance(x, y, 16, 6, 16, 12));
}

function campsiteDistance(x, y) {
  return Math.max(polygonDistance(x, y, [[4, 26], [16, 5], [28, 26]]),
    -polygonDistance(x, y, [[12, 27], [16, 15], [20, 27]]));
}

function caravanDistance(x, y) {
  var body = Math.max(rectangleDistance(x, y, 5, 8, 25, 22),
    -rectangleDistance(x, y, 8, 11, 14, 16), -rectangleDistance(x, y, 18, 11, 22, 20));
  return Math.min(body, Math.hypot(x - 11, y - 24) - 3,
    segmentDistance(x, y, 25, 21, 29, 24));
}

var distanceFields = {
  'osrm-poi-fuel': fuelDistance,
  'osrm-poi-lodging': lodgingDistance,
  'osrm-poi-ferry': ferryDistance,
  'osrm-poi-helipad': helipadDistance,
  'osrm-poi-cable-car': cableCarDistance,
  'osrm-poi-campsite': campsiteDistance,
  'osrm-poi-caravan': caravanDistance
};

function imageDefinition(id) {
  if (!Object.prototype.hasOwnProperty.call(distanceFields, id)) return null;
  var distance = distanceFields[id];
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
