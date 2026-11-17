'use strict';

var IMAGE_ID = 'osrm-road-shield';
var EXIT_IMAGE_ID = 'osrm-exit-shield';

// A small UI plate generated in code, with stretch zones that preserve its
// rounded border while MapLibre fits it around road references of any length.
function shieldImage() {
  var width = 64, height = 40, radius = 8;
  var data = new Uint8Array(width * height * 4);
  for (var y = 0; y < height; y++) {
    for (var x = 0; x < width; x++) {
      var dx = Math.max(radius - x - 0.5, 0, x + 0.5 - (width - radius));
      var dy = Math.max(radius - y - 0.5, 0, y + 0.5 - (height - radius));
      if (dx * dx + dy * dy > radius * radius) continue;
      var inside = x >= 2 && x < width - 2 && y >= 2 && y < height - 2 && dx * dx + dy * dy <= (radius - 2) * (radius - 2);
      var color = inside ? [248, 247, 243] : [100, 113, 124];
      var offset = (y * width + x) * 4;
      data.set([color[0], color[1], color[2], 255], offset);
    }
  }
  return { width: width, height: height, data: data };
}

// Keep the branching-road pictogram in a fixed left gutter. Only the empty
// number area stretches, so the exit symbol stays recognizable for long refs.
function exitShieldImage() {
  var width = 96, height = 40, radius = 4;
  var data = new Uint8Array(width * height * 4);
  var segments = [[14, 30, 14, 10], [14, 25, 29, 10], [22, 10, 29, 10], [29, 10, 29, 17]];
  for (var y = 0; y < height; y++) {
    for (var x = 0; x < width; x++) {
      var dx = Math.max(radius - x - 0.5, 0, x + 0.5 - (width - radius));
      var dy = Math.max(radius - y - 0.5, 0, y + 0.5 - (height - radius));
      if (dx * dx + dy * dy > radius * radius) continue;
      var border = x < 2 || x >= width - 2 || y < 2 || y >= height - 2 || dx * dx + dy * dy > (radius - 2) * (radius - 2);
      var color = border ? [157, 184, 200] : [36, 89, 111];
      var coverage = 0;
      segments.forEach(function(segment) {
        var vx = segment[2] - segment[0], vy = segment[3] - segment[1];
        var projection = Math.max(0, Math.min(1, ((x + 0.5 - segment[0]) * vx + (y + 0.5 - segment[1]) * vy) / (vx * vx + vy * vy)));
        var distance = Math.hypot(x + 0.5 - segment[0] - projection * vx, y + 0.5 - segment[1] - projection * vy);
        coverage = Math.max(coverage, Math.max(0, Math.min(1, 2 - distance)));
      });
      var offset = (y * width + x) * 4;
      for (var channel = 0; channel < 3; channel++) {
        data[offset + channel] = Math.round(color[channel] * (1 - coverage) + 248 * coverage);
      }
      data[offset + 3] = 255;
    }
  }
  return { width: width, height: height, data: data };
}

function imageDefinition(id) {
  if (id !== IMAGE_ID && id !== EXIT_IMAGE_ID) return null;
  var exit = id === EXIT_IMAGE_ID;
  return { image: exit ? exitShieldImage() : shieldImage(), options: exit ? {
    pixelRatio: 2, content: [38, 2, 94, 38], stretchX: [[42, 84]], stretchY: [[2, 8], [32, 38]]
  } : {
    pixelRatio: 2, content: [2, 2, 62, 38], stretchX: [[16, 48]], stretchY: [[12, 28]]
  } };
}

module.exports = { imageDefinition: imageDefinition, shieldImage: shieldImage, exitShieldImage: exitShieldImage, IMAGE_ID: IMAGE_ID, EXIT_IMAGE_ID: EXIT_IMAGE_ID };
