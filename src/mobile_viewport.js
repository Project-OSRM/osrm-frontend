'use strict';

var L = require('leaflet');
var controllers = new WeakMap();

function paneInsets(map) {
  var insets = { left: 0, bottom: 0 };
  if (!document.documentElement.classList.contains('osrm-theme-dark') || !map.getContainer) return insets;
  var controller = controllers.get(map);
  var panel = controller ? controller.panel : map.getContainer().querySelector('.leaflet-routing-container');
  if (!panel || panel.classList.contains('leaflet-routing-container-hide')) return insets;
  var size = map.getSize();
  var rect = panel.getBoundingClientRect();
  if (size.x > 0 && rect.width >= size.x - 1) insets.bottom = Math.min(rect.height, size.y);
  else if (size.x > 0 && size.x <= 900) insets.left = Math.min(rect.width, size.x);
  return insets;
}

function viewportOffset(map) {
  var insets = paneInsets(map);
  return L.point(-insets.left / 2, insets.bottom / 2);
}

function visibleCenterPoint(map) {
  return map.getSize().divideBy(2).subtract(viewportOffset(map));
}

function getCenter(map) {
  var offset = viewportOffset(map);
  return offset.x || offset.y ? map.containerPointToLatLng(visibleCenterPoint(map)) : map.getCenter();
}

// Explicit camera actions account for the current sheet size themselves. Start
// subsequent resize compensation from that size to avoid applying it twice.
function synchronize(map) {
  var controller = controllers.get(map);
  if (controller) controller.synchronize();
}

function centerForTarget(map, target, zoom) {
  synchronize(map);
  var offset = viewportOffset(map);
  return offset.x || offset.y ? map.unproject(map.project(target, zoom).add(offset), zoom) : target;
}

function attach(map, panel) {
  var previousOffset = viewportOffset(map);
  var remainder = L.point(0, 0);
  var zoomIn = map.zoomIn;
  var zoomOut = map.zoomOut;
  var controller = {
    panel: panel,
    synchronize: function() {
      previousOffset = viewportOffset(map);
      remainder = L.point(0, 0);
    },
    update: function() {
      var offset = viewportOffset(map);
      var distance = offset.subtract(previousOffset).add(remainder);
      var pixels = distance.round();
      previousOffset = offset;
      remainder = distance.subtract(pixels);
      // A plain pan keeps the renderer and route geometry alive while the
      // sheet moves. Carry subpixel rounding so repeated drags cannot drift.
      if (pixels.x || pixels.y) {
        // stop() also resets an idle continuous-zoom renderer; interrupt only
        // a pan that would otherwise overwrite the sheet's camera offset.
        if (map._panAnim && map._panAnim._inProgress) map.stop();
        map.panBy(pixels, { animate: false });
      }
    },
    destroy: function() {
      map.zoomIn = zoomIn;
      map.zoomOut = zoomOut;
      controllers.delete(map);
    }
  };
  controllers.set(map, controller);
  controller.synchronize();
  map.zoomIn = function(delta, options) {
    var offset = viewportOffset(map);
    if (!offset.x && !offset.y) return zoomIn.call(map, delta, options);
    return map.setZoomAround(visibleCenterPoint(map), map.getZoom() + (delta === undefined ? map.options.zoomDelta : delta), options);
  };
  map.zoomOut = function(delta, options) {
    var offset = viewportOffset(map);
    if (!offset.x && !offset.y) return zoomOut.call(map, delta, options);
    return map.setZoomAround(visibleCenterPoint(map), map.getZoom() - (delta === undefined ? map.options.zoomDelta : delta), options);
  };
  return controller;
}

// LocateControl also pans directly when a cached location is requested again.
// Adjust the camera arguments, leaving its location marker and accuracy intact.
function configureLocationControl(map, control) {
  var setView = control._setViewIgnoringEvents;
  if (!setView) return;
  control._setViewIgnoringEvents = function(method, args) {
    var insets = paneInsets(map);
    if (insets.left || insets.bottom) {
      args = args.slice();
      if (method === 'panTo' || method === 'flyTo' || method === 'setView') {
        var zoom = method === 'panTo' || args[1] === undefined ? map.getZoom() : args[1];
        args[0] = centerForTarget(map, args[0], zoom);
      } else if (method === 'fitBounds' || method === 'flyToBounds') {
        synchronize(map);
        var options = Object.assign({}, args[1]);
        var padding = L.point(options.padding || [0, 0]);
        options.paddingTopLeft = L.point(options.paddingTopLeft || padding).add([insets.left, 0]);
        options.paddingBottomRight = L.point(options.paddingBottomRight || padding).add([0, insets.bottom]);
        args[1] = options;
      }
    }
    return setView.call(this, method, args);
  };
}

module.exports = {
  attach: attach,
  getCenter: getCenter,
  centerForTarget: centerForTarget,
  synchronize: synchronize,
  configureLocationControl: configureLocationControl
};
