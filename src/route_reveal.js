'use strict';

var L = require('leaflet');

// Advance by screen distance, interpolating between vertices instead of revealing
// whole segments. Each completed vertex is appended only once during the sweep.
function createSweepGeometry(parts) {
  var steps = [];
  var distance = 0;
  parts.forEach(function(points) {
    points.forEach(function(point, index) {
      if (index) distance += point.distanceTo(points[index - 1]);
      steps.push({ point: point, distance: distance, move: index === 0 });
    });
  });
  var cursor = 0;
  var completed = '';
  return function(progress) {
    var target = distance * progress;
    while (cursor < steps.length && steps[cursor].distance <= target) {
      var step = steps[cursor++];
      completed += (step.move ? 'M' : 'L') + step.point.x + ' ' + step.point.y;
    }
    var next = steps[cursor];
    if (!next || next.move || !cursor) return completed || 'M0 0';
    var previous = steps[cursor - 1];
    var fraction = (target - previous.distance) / (next.distance - previous.distance);
    var tip = previous.point.add(next.point.subtract(previous.point).multiplyBy(fraction));
    return completed + 'L' + tip.x + ' ' + tip.y;
  };
}

function revealLine(line, duration) {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var paths = [];
  line.getLayers().slice(-line.options.styles.length).forEach(function(layer) {
    var path = layer.getElement && layer.getElement();
    if (!path || path.namespaceURI !== 'http://www.w3.org/2000/svg') return;
    var originalClip = layer.options.noClip;
    var visibility = path.style.visibility;
    path.style.visibility = 'hidden';
    layer.options.noClip = true;
    layer.redraw();
    paths.push({ layer: layer, path: path, visibility: visibility, originalClip: originalClip });
  });
  if (!paths.length) return;
  var frame;
  var map = line._map;
  var moving = !!(map._animatingZoom || map._panAnim && map._panAnim._inProgress || map.smoothWheelZoom && map.smoothWheelZoom._active);
  var settledFrame = false;
  var started;
  var geometry;
  function schedule() {
    if (!moving && frame === undefined) frame = L.Util.requestAnimFrame(animate);
  }
  function pauseForCentering() {
    if (started !== undefined) return finish();
    moving = true;
    if (frame !== undefined) L.Util.cancelAnimFrame(frame);
    frame = undefined;
    settledFrame = false;
  }
  function resumeAfterCentering() {
    moving = false;
    settledFrame = false;
    schedule();
  }
  function finish() {
    if (frame !== undefined) L.Util.cancelAnimFrame(frame);
    frame = undefined;
    line.off('remove', finish);
    map.off('movestart zoomstart', pauseForCentering);
    map.off('moveend zoomend', resumeAfterCentering);
    paths.forEach(function(item) {
      if (item.originalClip === undefined) delete item.layer.options.noClip;
      else item.layer.options.noClip = item.originalClip;
      if (item.layer._map) item.layer.redraw();
      item.path.style.visibility = item.visibility;
    });
  }
  function animate() {
    frame = undefined;
    if (moving) return;
    if (started === undefined) {
      if (!settledFrame) {
        settledFrame = true;
        schedule();
        return;
      }
      // Centering has finished: reuse Leaflet's projected, simplified geometry.
      // All stroke styles share this geometry, keeping their edges aligned.
      geometry = createSweepGeometry(paths[0].layer._parts);
      started = window.performance.now();
    }
    var progress = Math.min(1, (window.performance.now() - started) / duration);
    if (progress >= 1) return finish();
    var eased = progress * progress * (3 - 2 * progress);
    var drawing = geometry(eased);
    paths.forEach(function(item) {
      item.path.setAttribute('d', drawing);
      item.path.style.visibility = item.visibility;
    });
    schedule();
  }
  line.once('remove', finish);
  map.on('movestart zoomstart', pauseForCentering);
  map.on('moveend zoomend', resumeAfterCentering);
  schedule();
}

function createRouteLineFactory(createLine) {
  var revealedRoutes = new WeakSet();
  return function(route, options) {
    var line = (createLine || L.Routing.line)(route, options);
    if (!revealedRoutes.has(route)) {
      line.once('add', function() {
        revealLine(line, 750);
        Promise.resolve().then(function() {
          if (line._map) revealedRoutes.add(route);
        });
      });
    }
    return line;
  };
}

module.exports = { createRouteLineFactory: createRouteLineFactory, createSweepGeometry: createSweepGeometry };
