'use strict';

var L = require('leaflet');

// Use Leaflet's continuous camera path (also used by touch pinch), rather than
// starting an integer-level CSS zoom animation for each wheel-event batch.
var SmoothWheelZoom = L.Handler.extend({
  options: {
    pixelsPerZoomLevel: 200,
    easingTime: 65,
    idleTime: 140
  },

  initialize: function(map, options) {
    L.Handler.prototype.initialize.call(this, map);
    L.setOptions(this, options);
  },

  addHooks: function() {
    var map = this._map;
    this._nativeEnabled = map.scrollWheelZoom.enabled();
    this._previousSnap = map.options.zoomSnap;
    map.scrollWheelZoom.disable();
    map.options.zoomSnap = 0;
    L.DomEvent.on(map.getContainer(), 'wheel', this._onWheel, this);
    L.DomEvent.on(map.getContainer(), 'mousedown touchstart dblclick', this._interrupt, this);
    map.on('movestart', this._onExternalMove, this);
    map.on('unload', this._onUnload, this);
  },

  removeHooks: function() {
    this._finish();
    var map = this._map;
    L.DomEvent.off(map.getContainer(), 'wheel', this._onWheel, this);
    L.DomEvent.off(map.getContainer(), 'mousedown touchstart dblclick', this._interrupt, this);
    map.off('movestart', this._onExternalMove, this);
    map.off('unload', this._onUnload, this);
    map.options.zoomSnap = this._previousSnap;
    if (this._nativeEnabled && !this._unloading) map.scrollWheelZoom.enable();
  },

  _onWheel: function(event) {
    var map = this._map;
    if (!map._loaded || map.touchZoom && map.touchZoom._zooming) return;
    var delta = L.DomEvent.getWheelDelta(event);
    if (!delta) return;
    L.DomEvent.stop(event);
    // Finish a button/double-click animation before accepting a new gesture.
    if (map._animatingZoom) map._onZoomTransitionEnd();
    var current = map.getZoom();
    var change = Math.max(-240, Math.min(240, delta)) / this.options.pixelsPerZoomLevel;
    // Chrome reports trackpad pinch as small ctrl+wheel deltas.
    if (event.ctrlKey) change *= 3;
    var target = Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(),
      (this._active ? this._targetZoom : current) + change));
    if (!this._active && target === current) return;
    this._targetZoom = target;
    this._pointer = map.options.scrollWheelZoom === 'center' ? map.getSize().divideBy(2) : map.mouseEventToContainerPoint(event);
    this._anchor = map.containerPointToLatLng(this._pointer);
    this._lastInputTime = Date.now();
    if (!this._active) {
      map._stop();
      this._active = true;
      this._lastFrameTime = Date.now();
      this._starting = true;
      map._moveStart(true);
      this._starting = false;
    }
    if (this._frame === undefined) this._frame = L.Util.requestAnimFrame(this._animate, this);
  },

  _animate: function() {
    this._frame = undefined;
    if (!this._active) return;
    var now = Date.now();
    var elapsed = Math.min(64, Math.max(0, now - this._lastFrameTime));
    this._lastFrameTime = now;
    var map = this._map;
    var current = map.getZoom();
    var zoom = current + (this._targetZoom - current) * (1 - Math.exp(-elapsed / this.options.easingTime));
    var settled = Math.abs(this._targetZoom - zoom) < 0.0001;
    if (settled) zoom = this._targetZoom;
    var offset = this._pointer.subtract(map.getSize().divideBy(2));
    var center = map.unproject(map.project(this._anchor, zoom).subtract(offset), zoom);
    // A pinch-like update keeps overlays aligned without a view reset or
    // geometry request for every frame. zoomend/moveend occur once on release.
    if (zoom !== current) map._move(center, zoom, { pinch: true, round: false, smoothWheel: true });
    if (settled && now - this._lastInputTime >= this.options.idleTime) {
      this._finish();
    } else {
      this._frame = L.Util.requestAnimFrame(this._animate, this);
    }
  },

  _finish: function(emitEnd) {
    if (this._frame !== undefined) L.Util.cancelAnimFrame(this._frame);
    this._frame = undefined;
    if (!this._active) return;
    this._active = false;
    if (emitEnd !== false) this._map._moveEnd(true);
  },

  _interrupt: function() {
    this._finish();
  },

  _onExternalMove: function() {
    if (!this._starting) this._finish();
  },

  _onUnload: function() {
    this._unloading = true;
    this._finish(false);
    this.disable();
  }
});

function enableSmoothWheelZoom(map, options) {
  if (!map.smoothWheelZoom) map.smoothWheelZoom = new SmoothWheelZoom(map, options);
  map.smoothWheelZoom.enable();
  return map.smoothWheelZoom;
}

module.exports = { enable: enableSmoothWheelZoom };
