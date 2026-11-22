'use strict';

var L = require('leaflet');

// Match Leaflet's cubic-bezier(0, 0, 0.25, 1) zoom transition.
function zoomProgress(progress) {
  var low = 0;
  var high = 1;
  for (var i = 0; i < 14; i++) {
    var t = (low + high) / 2;
    var x = 0.75 * (1 - t) * t * t + t * t * t;
    if (x < progress) low = t;
    else high = t;
  }
  var time = (low + high) / 2;
  return 3 * (1 - time) * time * time + time * time * time;
}

var FixedWidthRenderer = L.SVG.extend({
  onAdd: function(map) {
    L.SVG.prototype.onAdd.call(this, map);
    // Scaling the outer SVG in CSS scales its composited pixels, including
    // non-scaling strokes. Transform geometry inside the SVG instead.
    L.DomUtil.removeClass(this._container, 'leaflet-zoom-animated');
  },

  _initPath: function(layer) {
    L.SVG.prototype._initPath.call(this, layer);
    layer._path.setAttribute('vector-effect', 'non-scaling-stroke');
  },

  _geometryTransform: function(center, zoom) {
    var scale = this._map.getZoomScale(zoom, this._zoom);
    var viewHalf = this._map.getSize().multiplyBy(0.5 + this.options.padding);
    var offset = viewHalf.multiplyBy(-scale).add(this._map.project(this._center, zoom))
      .subtract(this._map._getNewPixelOrigin(center, zoom));
    return { scale: scale, offset: offset.subtract(this._bounds.min.multiplyBy(scale)) };
  },

  _applyGeometryTransform: function(transform) {
    this._geometry = transform;
    L.DomUtil.setPosition(this._container, this._bounds.min);
    this._rootGroup.setAttribute('transform', 'matrix(' + transform.scale + ' 0 0 ' + transform.scale + ' ' + transform.offset.x + ' ' + transform.offset.y + ')');
  },

  _cancelZoomFrame: function() {
    if (this._zoomFrame !== undefined) L.Util.cancelAnimFrame(this._zoomFrame);
    this._zoomFrame = undefined;
  },

  _updateTransform: function(center, zoom) {
    this._cancelZoomFrame();
    this._applyGeometryTransform(this._geometryTransform(center, zoom));
  },

  _onAnimZoom: function(event) {
    this._cancelZoomFrame();
    var start = this._geometry || { scale: 1, offset: L.point(0, 0) };
    var target = this._geometryTransform(event.center, event.zoom);
    var started = Date.now();
    var animate = function() {
      this._zoomFrame = undefined;
      var elapsed = Math.min(1, (Date.now() - started) / 250);
      var progress = elapsed === 1 ? 1 : zoomProgress(elapsed);
      this._applyGeometryTransform({
        scale: start.scale + (target.scale - start.scale) * progress,
        offset: start.offset.add(target.offset.subtract(start.offset).multiplyBy(progress))
      });
      if (elapsed < 1) this._zoomFrame = L.Util.requestAnimFrame(animate, this);
    }.bind(this);
    this._zoomFrame = L.Util.requestAnimFrame(animate, this);
  },

  _update: function() {
    if (this._map._animatingZoom && this._bounds) return;
    this._cancelZoomFrame();
    this._geometry = { scale: 1, offset: L.point(0, 0) };
    this._rootGroup.removeAttribute('transform');
    L.SVG.prototype._update.call(this);
  },

  onRemove: function(map) {
    this._cancelZoomFrame();
    L.SVG.prototype.onRemove.call(this, map);
  }
});

module.exports = function() {
  return L.Browser.svg ? new FixedWidthRenderer() : undefined;
};
