'use strict';

/**
 * Visvalingam–Whyatt polygon simplification, driven by visual negligibility.
 *
 * Repeatedly discards the vertex whose triangle with its two neighbours has the
 * smallest area, recomputing the neighbours each time. Ranking by area rather
 * than by perpendicular distance is what keeps the outline recognisable: a
 * vertex only goes when the sliver it contributes is too small to see.
 *
 * The stopping rule is the point of this module. Simplification halts as soon as
 * the smallest surviving triangle would be visible on screen, so the shape the
 * user sees is the shape of the thing on the map — a U-shaped museum stays
 * U-shaped. The threshold is a fraction of the shape's own bounding box, which
 * makes it scale-free: the picker frames a place to roughly the same number of
 * pixels whether it is a 5 km airport or a 170 m building, so the same fraction
 * means the same number of pixels in both cases. An absolute tolerance in
 * degrees — Nominatim's polygon_threshold — cannot do this: a value large enough
 * to thin the airport flattens the building into a few stray corners.
 *
 * A point budget exists only as a backstop against pathological geometry. It is
 * far above what a building or a site actually has, and reaching it is the one
 * case where the shape may visibly change.
 *
 * Coordinates are GeoJSON [lon, lat] pairs. Areas are compared in that raw
 * degree space: every comparison is between triangles of the same shape, so the
 * longitude foreshortening is a constant factor and does not affect the ranking.
 *
 * @module simplify
 */

// Roughly the width in pixels the picker gives a framed place. Only used to turn
// "half a pixel" into a fraction of the shape's extent, so it does not need to
// match any particular viewport closely.
var ASSUMED_RENDER_SPAN_PX = 1000;

// A triangle smaller than this on screen cannot be distinguished from the line
// through its neighbours.
var NEGLIGIBLE_PX = 0.5;

// Backstop only. A building runs to a few dozen points and BER to under 400, so
// this is not reached by anything the picker normally draws.
var DEFAULT_MAX_POINTS = 2000;

// Twice the area of the triangle (a, b, c) — the cross product of its two edges.
// The factor of two is common to every vertex and to the threshold, so it never
// affects a comparison and is left in.
function doubleTriangleArea(a, b, c) {
  return Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]));
}

/**
 * The doubled-triangle-area below which a vertex is invisible once the given
 * extent is framed on screen. Returns 0 for a degenerate extent, which disables
 * negligibility removal rather than removing everything.
 *
 * @param {{width: number, height: number}} extent — in degrees
 */
function negligibleDoubleArea(extent) {
  if (!extent) return 0;
  var span = Math.max(extent.width || 0, extent.height || 0);
  if (!(span > 0)) return 0;
  var degreesPerPixel = span / ASSUMED_RENDER_SPAN_PX;
  return 2 * NEGLIGIBLE_PX * degreesPerPixel * degreesPerPixel;
}

// Binary min-heap of {area, index}. Entries are never removed on update; a stale
// entry is recognised on pop by comparing its area against the vertex's current
// one, which is the usual lazy-deletion trick and keeps the heap simple.
function createMinHeap() {
  var items = [];

  function swap(i, j) {
    var tmp = items[i];
    items[i] = items[j];
    items[j] = tmp;
  }

  return {
    size: function() {
      return items.length;
    },
    push: function(item) {
      items.push(item);
      var i = items.length - 1;
      while (i > 0) {
        var parent = (i - 1) >> 1;
        if (items[parent].area <= items[i].area) break;
        swap(parent, i);
        i = parent;
      }
    },
    pop: function() {
      if (items.length === 0) return null;
      var top = items[0];
      var last = items.pop();
      if (items.length > 0) {
        items[0] = last;
        var i = 0;
        for (;;) {
          var left = 2 * i + 1;
          var right = left + 1;
          var smallest = i;
          if (left < items.length && items[left].area < items[smallest].area) smallest = left;
          if (right < items.length && items[right].area < items[smallest].area) smallest = right;
          if (smallest === i) break;
          swap(i, smallest);
          i = smallest;
        }
      }
      return top;
    }
  };
}

/**
 * Simplifies an open sequence of points, keeping the first and last exactly.
 *
 * @param {Array<Array<number>>} points — [[lon, lat], …]
 * @param {object} [options]
 * @param {number} [options.minDoubleArea] — remove vertices below this; 0 removes none
 * @param {number} [options.maxPoints] — hard cap, enforced even if it costs shape
 * @param {number} [options.floor] — never go below this many points
 * @param {boolean} [options.closed] — treat the sequence as a cycle, so no vertex
 *   is pinned. A ring has no start, and pinning one leaves a stray vertex sitting
 *   on the closing edge that nothing can remove.
 * @returns {Array<Array<number>>} the input itself when nothing was removed
 */
function simplifyLine(points, options) {
  if (!Array.isArray(points) || points.length < 3) return points;
  options = options || {};
  var minDoubleArea = options.minDoubleArea > 0 ? options.minDoubleArea : 0;
  var maxPoints = options.maxPoints > 0 ? options.maxPoints : DEFAULT_MAX_POINTS;
  var closed = !!options.closed;
  var floor = Math.max(closed ? 3 : 2, options.floor || 0);

  if (minDoubleArea === 0 && points.length <= maxPoints) return points;

  // Doubly linked list over the original indices, so neighbours stay findable as
  // vertices are removed.
  var n = points.length;
  var prev = new Array(n);
  var next = new Array(n);
  var alive = new Array(n);
  var area = new Array(n);
  for (var i = 0; i < n; i++) {
    prev[i] = i - 1;
    next[i] = i + 1;
    alive[i] = true;
    area[i] = Infinity;
  }
  if (closed) {
    prev[0] = n - 1;
    next[n - 1] = 0;
  } else {
    next[n - 1] = -1;
  }

  var heap = createMinHeap();
  var firstCandidate = closed ? 0 : 1;
  var lastCandidate = closed ? n - 1 : n - 2;
  for (var k = firstCandidate; k <= lastCandidate; k++) {
    area[k] = doubleTriangleArea(points[prev[k]], points[k], points[next[k]]);
    heap.push({area: area[k], index: k});
  }

  var remaining = points.length;
  var removed = 0;
  while (remaining > floor && heap.size() > 0) {
    var top = heap.pop();
    var idx = top.index;
    // Stale entry: this vertex has since been removed, or its area was
    // recomputed after a neighbour disappeared.
    if (!alive[idx] || top.area !== area[idx]) continue;

    // The heap is ordered, so once the smallest survivor is visible there is
    // nothing left that can go without altering the shape. Keep going only if
    // the hard cap still demands it.
    var negligible = top.area < minDoubleArea;
    if (!negligible && remaining <= maxPoints) break;

    alive[idx] = false;
    remaining--;
    removed++;
    var before = prev[idx];
    var after = next[idx];
    next[before] = after;
    prev[after] = before;

    // Both neighbours now span a different triangle.
    [before, after].forEach(function(nb) {
      if (prev[nb] < 0 || next[nb] < 0) return;
      area[nb] = doubleTriangleArea(points[prev[nb]], points[nb], points[next[nb]]);
      heap.push({area: area[nb], index: nb});
    });
  }

  if (removed === 0) return points;

  var out = [];
  for (var j = 0; j < points.length; j++) {
    if (alive[j]) out.push(points[j]);
  }
  return out;
}

/**
 * Simplifies a closed GeoJSON ring. The repeated closing vertex is held out of
 * the simplification and re-appended, so the ring stays closed, and the result
 * never drops below the four points a valid ring needs.
 */
function simplifyRing(ring, options) {
  if (!Array.isArray(ring) || ring.length < 5) return ring;

  var first = ring[0];
  var last = ring[ring.length - 1];
  var closed = first[0] === last[0] && first[1] === last[1];
  var open = closed ? ring.slice(0, -1) : ring;

  var opts = {
    minDoubleArea: options && options.minDoubleArea,
    maxPoints: options && options.maxPoints ? Math.max(3, options.maxPoints - (closed ? 1 : 0)) : 0,
    // Cyclic: the vertex the ring happens to start at is not special, and pinning
    // it would strand a removable point on the closing edge.
    closed: closed,
    floor: 3
  };
  var simplified = simplifyLine(open, opts);
  if (simplified === open) return ring;
  return closed ? simplified.concat([simplified[0]]) : simplified;
}

function geometryRings(geometry) {
  if (!geometry || !Array.isArray(geometry.coordinates)) return [];
  if (geometry.type === 'Polygon') return geometry.coordinates;
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.reduce(function(all, polygon) {
      return all.concat(polygon);
    }, []);
  }
  return [];
}

/**
 * Bounding extent of a polygon geometry, in degrees. Null when there is nothing
 * to measure.
 */
function geometryExtent(geometry) {
  var rings = geometryRings(geometry);
  var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  var seen = false;
  rings.forEach(function(ring) {
    if (!Array.isArray(ring)) return;
    ring.forEach(function(p) {
      if (!Array.isArray(p) || p.length < 2) return;
      seen = true;
      if (p[0] < minX) minX = p[0];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[1] > maxY) maxY = p[1];
    });
  });
  if (!seen) return null;
  return {width: maxX - minX, height: maxY - minY};
}

/**
 * Simplifies a GeoJSON Polygon or MultiPolygon, returning a new geometry and
 * leaving the input untouched. The negligibility threshold is derived from the
 * whole shape's extent — not per ring — because that extent is what sets the
 * scale the shape is drawn at, and a hole's detail has to be judged at the same
 * scale as the outer ring's. Anything that is not a polygon comes back as-is.
 *
 * @param {object} geometry
 * @param {object} [options]
 * @param {number} [options.maxPoints] — per-ring backstop
 */
function simplifyGeometry(geometry, options) {
  if (!geometry || !Array.isArray(geometry.coordinates)) return geometry;
  if (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon') return geometry;

  options = options || {};
  var ringOptions = {
    minDoubleArea: negligibleDoubleArea(geometryExtent(geometry)),
    maxPoints: options.maxPoints || DEFAULT_MAX_POINTS
  };

  if (geometry.type === 'Polygon') {
    return {
      type: 'Polygon',
      coordinates: geometry.coordinates.map(function(ring) {
        return simplifyRing(ring, ringOptions);
      })
    };
  }
  return {
    type: 'MultiPolygon',
    coordinates: geometry.coordinates.map(function(polygon) {
      return polygon.map(function(ring) {
        return simplifyRing(ring, ringOptions);
      });
    })
  };
}

function countPoints(geometry) {
  return geometryRings(geometry).reduce(function(sum, ring) {
    return sum + (Array.isArray(ring) ? ring.length : 0);
  }, 0);
}

module.exports = {
  simplifyLine: simplifyLine,
  simplifyRing: simplifyRing,
  simplifyGeometry: simplifyGeometry,
  geometryExtent: geometryExtent,
  negligibleDoubleArea: negligibleDoubleArea,
  countPoints: countPoints,
  ASSUMED_RENDER_SPAN_PX: ASSUMED_RENDER_SPAN_PX,
  NEGLIGIBLE_PX: NEGLIGIBLE_PX,
  DEFAULT_MAX_POINTS: DEFAULT_MAX_POINTS
};
