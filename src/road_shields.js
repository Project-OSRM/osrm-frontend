'use strict';

var IMAGE_ID = 'osrm-road-shield';

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

function registerRoadShields(map) {
  map.on('styleimagemissing', function(event) {
    if (event.id !== IMAGE_ID || map.hasImage(IMAGE_ID)) return;
    map.addImage(IMAGE_ID, shieldImage(), {
      pixelRatio: 2, content: [10, 6, 54, 34], stretchX: [[16, 48]], stretchY: [[12, 28]]
    });
  });
}

module.exports = { registerRoadShields: registerRoadShields, shieldImage: shieldImage, IMAGE_ID: IMAGE_ID };
