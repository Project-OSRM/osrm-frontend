'use strict';

var L = require('leaflet');
var nextMaskId = 0;

// Mask the existing strokes, preserving their widths, colors and dash patterns.
// Normalized SVG path lengths give every route the same 750 ms duration.
function revealLine(line, duration) {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var paths = line.getLayers().slice(-line.options.styles.length);
  var masks = [];
  paths.forEach(function(layer) {
    var path = layer.getElement && layer.getElement();
    if (!path || path.namespaceURI !== 'http://www.w3.org/2000/svg') return;
    var originalClip = layer.options.noClip;
    layer.options.noClip = true;
    layer.redraw();
    var defs = L.SVG.create('defs');
    var mask = L.SVG.create('mask');
    var sweep = L.SVG.create('path');
    var id = 'osrm-route-reveal-' + (++nextMaskId);
    mask.id = id;
    mask.setAttribute('maskUnits', 'userSpaceOnUse');
    sweep.setAttribute('fill', 'none');
    sweep.setAttribute('stroke', 'white');
    sweep.setAttribute('stroke-width', (layer.options.weight || 3) + 4);
    sweep.setAttribute('stroke-linecap', 'butt');
    sweep.setAttribute('stroke-linejoin', 'round');
    sweep.setAttribute('vector-effect', 'non-scaling-stroke');
    sweep.setAttribute('pathLength', '1000');
    sweep.setAttribute('stroke-dasharray', '0 1000');
    mask.appendChild(sweep);
    defs.appendChild(mask);
    layer._renderer._container.appendChild(defs);
    var previousMask = path.getAttribute('mask');
    path.setAttribute('mask', 'url(#' + id + ')');
    function updateGeometry() {
      sweep.setAttribute('d', path.getAttribute('d') || 'M0 0');
      var bounds = layer._renderer._bounds;
      var size = bounds.getSize();
      mask.setAttribute('x', bounds.min.x - 16);
      mask.setAttribute('y', bounds.min.y - 16);
      mask.setAttribute('width', size.x + 32);
      mask.setAttribute('height', size.y + 32);
    }
    updateGeometry();
    var observer = new MutationObserver(updateGeometry);
    observer.observe(path, { attributes: true, attributeFilter: ['d'] });
    masks.push({ layer: layer, path: path, sweep: sweep, defs: defs, observer: observer, previousMask: previousMask, originalClip: originalClip });
  });
  if (!masks.length) return;
  var frame;
  var started = Date.now();
  function finish() {
    if (frame !== undefined) L.Util.cancelAnimFrame(frame);
    frame = undefined;
    line.off('remove', finish);
    masks.forEach(function(item) {
      item.observer.disconnect();
      if (item.previousMask === null) item.path.removeAttribute('mask');
      else item.path.setAttribute('mask', item.previousMask);
      item.defs.remove();
      if (item.originalClip === undefined) delete item.layer.options.noClip;
      else item.layer.options.noClip = item.originalClip;
      if (item.layer._map) item.layer.redraw();
    });
  }
  function animate() {
    frame = undefined;
    var progress = Math.min(1, (Date.now() - started) / duration);
    if (progress >= 1) return finish();
    masks.forEach(function(item) {
      item.sweep.setAttribute('stroke-dasharray', (progress * 1000) + ' 1000');
    });
    frame = L.Util.requestAnimFrame(animate);
  }
  line.once('remove', finish);
  frame = L.Util.requestAnimFrame(animate);
}

function createRouteLineFactory(createLine) {
  var revealedRoutes = new WeakSet();
  return function(route, options) {
    var line = (createLine || L.Routing.line)(route, options);
    if (!revealedRoutes.has(route)) {
      line.once('add', function() {
        revealLine(line, 750);
        // Initial alternative restoration may replace this line synchronously.
        Promise.resolve().then(function() {
          if (line._map) revealedRoutes.add(route);
        });
      });
    }
    return line;
  };
}

module.exports = { createRouteLineFactory: createRouteLineFactory };
