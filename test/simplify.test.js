'use strict';

const simplify = require('../src/simplify');

// A square with a deep notch cut into its north edge — the U shape a museum or a
// terminal building has. Every vertex here carries real shape.
function notchedSquare() {
  return [
    [0, 0], [10, 0], [10, 10],
    [6, 10], [6, 4], [4, 4], [4, 10],
    [0, 10], [0, 0]
  ];
}

// The same U, but with each edge sampled at extra collinear points. Those extras
// contribute zero area and are exactly what simplification should take.
function notchedSquareOversampled(perEdge) {
  const base = notchedSquare();
  const out = [];
  for (let i = 0; i < base.length - 1; i++) {
    const [x1, y1] = base[i];
    const [x2, y2] = base[i + 1];
    for (let s = 0; s < perEdge; s++) {
      const t = s / perEdge;
      out.push([x1 + (x2 - x1) * t, y1 + (y2 - y1) * t]);
    }
  }
  out.push(base[0]);
  return out;
}

const AGGRESSIVE = {minDoubleArea: 1e9};

describe('negligibleDoubleArea', () => {
  test('scales with the shape, so the same fraction means the same pixels', () => {
    const big = simplify.negligibleDoubleArea({width: 0.084, height: 0.05});
    const small = simplify.negligibleDoubleArea({width: 0.0025, height: 0.0015});
    // A 34x smaller shape tolerates a ~34^2 smaller triangle.
    expect(big / small).toBeCloseTo(Math.pow(0.084 / 0.0025, 2), 0);
  });

  test('is zero for a degenerate extent, which removes nothing at all', () => {
    expect(simplify.negligibleDoubleArea({width: 0, height: 0})).toBe(0);
    expect(simplify.negligibleDoubleArea(null)).toBe(0);
  });
});

describe('simplifyLine', () => {
  test('removes nothing when no vertex is negligible', () => {
    const pts = [[0, 0], [1, 5], [2, 0], [3, 5]];
    expect(simplify.simplifyLine(pts, {minDoubleArea: 0})).toBe(pts);
  });

  test('keeps the first and last point exactly', () => {
    const pts = notchedSquareOversampled(6);
    const out = simplify.simplifyLine(pts, AGGRESSIVE);
    expect(out[0]).toEqual(pts[0]);
    expect(out[out.length - 1]).toEqual(pts[pts.length - 1]);
  });

  test('drops only the vertices that carry no shape', () => {
    const pts = [[0, 0], [1, 0], [2, 0], [3, 5], [4, 0], [5, 0], [6, 0]];
    const out = simplify.simplifyLine(pts, {minDoubleArea: 1});
    // [1,0] and [5,0] are collinear with their neighbours and go. [2,0] and
    // [4,0] are the feet of the spike — their triangles have real area — so they
    // stay, and with them the spike's actual shape.
    expect(out).toEqual([[0, 0], [2, 0], [3, 5], [4, 0], [6, 0]]);
  });

  test('a run of genuinely collinear points collapses to its endpoints', () => {
    const pts = [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0]];
    expect(simplify.simplifyLine(pts, {minDoubleArea: 1})).toEqual([[0, 0], [5, 0]]);
  });

  test('stops at the first visible vertex rather than running to a budget', () => {
    const pts = [[0, 0], [1, 0], [2, 0], [3, 5], [4, 0], [5, 0], [6, 0]];
    const out = simplify.simplifyLine(pts, {minDoubleArea: 1, maxPoints: 3});
    // The spike survives because it is not negligible, even though the cap is met.
    expect(out).toContainEqual([3, 5]);
  });

  test('the hard cap still bites on pathological input', () => {
    const pts = [];
    for (let i = 0; i < 200; i++) pts.push([i, i % 2 === 0 ? 0 : 5]);
    const out = simplify.simplifyLine(pts, {minDoubleArea: 0, maxPoints: 20});
    expect(out.length).toBeLessThanOrEqual(20);
  });

  test('never goes below the floor', () => {
    const out = simplify.simplifyLine(notchedSquareOversampled(6), {minDoubleArea: 1e9, floor: 4});
    expect(out.length).toBeGreaterThanOrEqual(4);
  });

  test('tolerates short and non-array input', () => {
    expect(simplify.simplifyLine(null, AGGRESSIVE)).toBeNull();
    const two = [[0, 0], [1, 1]];
    expect(simplify.simplifyLine(two, AGGRESSIVE)).toBe(two);
  });
});

describe('simplifyRing', () => {
  test('keeps the ring closed', () => {
    const out = simplify.simplifyRing(notchedSquareOversampled(6), {minDoubleArea: 1});
    expect(out[0]).toEqual(out[out.length - 1]);
  });

  test('returns the original ring when nothing is negligible', () => {
    const ring = notchedSquare();
    expect(simplify.simplifyRing(ring, {minDoubleArea: 0})).toBe(ring);
  });

  test('recovers the exact U shape from an oversampled one', () => {
    const out = simplify.simplifyRing(notchedSquareOversampled(8), {minDoubleArea: 0.001});
    expect(out).toEqual(notchedSquare());
  });

  test('never reduces a ring below a valid four points', () => {
    const out = simplify.simplifyRing(notchedSquareOversampled(4), {minDoubleArea: 1e9});
    expect(out.length).toBeGreaterThanOrEqual(4);
    expect(out[0]).toEqual(out[out.length - 1]);
  });

  test('leaves short rings untouched', () => {
    const tiny = [[0, 0], [1, 0], [0, 1], [0, 0]];
    expect(simplify.simplifyRing(tiny, AGGRESSIVE)).toBe(tiny);
  });
});

describe('simplifyGeometry', () => {
  test('judges a hole at the whole shape’s scale, not its own', () => {
    // A large outer ring with a small oversampled hole. Were the hole judged
    // against its own extent it would keep detail invisible at the drawn scale.
    const outer = notchedSquareOversampled(8);
    const hole = notchedSquareOversampled(8).map(([x, y]) => [x / 100 + 4, y / 100 + 4]);
    const out = simplify.simplifyGeometry({type: 'Polygon', coordinates: [outer, hole]});
    expect(out.coordinates[1].length).toBeLessThan(hole.length);
  });

  test('walks every ring of a MultiPolygon', () => {
    const geometry = {
      type: 'MultiPolygon',
      coordinates: [[notchedSquareOversampled(8)], [notchedSquareOversampled(8)]]
    };
    const out = simplify.simplifyGeometry(geometry);
    expect(out.type).toBe('MultiPolygon');
    expect(out.coordinates[0][0].length).toBeLessThan(geometry.coordinates[0][0].length);
  });

  test('does not mutate the input', () => {
    const geometry = {type: 'Polygon', coordinates: [notchedSquareOversampled(8)]};
    const before = geometry.coordinates[0].length;
    simplify.simplifyGeometry(geometry);
    expect(geometry.coordinates[0]).toHaveLength(before);
  });

  test('passes through anything that is not a polygon', () => {
    const point = {type: 'Point', coordinates: [1, 2]};
    expect(simplify.simplifyGeometry(point)).toBe(point);
    expect(simplify.simplifyGeometry(null)).toBeNull();
  });
});

// The regression this module exists for. Nominatim's polygon_threshold is an
// absolute tolerance in degrees, so the value that thinned BER collapsed the
// Pergamonmuseum's 32-point outline to 5 stray corners. These are the real
// coordinates of both.
describe('real outlines keep their shape', () => {
  const PERGAMON = [
    [13.395229, 52.520969], [13.395579, 52.520719], [13.396513, 52.521217],
    [13.396635, 52.521133], [13.396428, 52.521025], [13.396523, 52.520957],
    [13.396617, 52.520889], [13.396829, 52.521], [13.396958, 52.520911],
    [13.396009, 52.520411], [13.39636, 52.52016], [13.396605, 52.520287],
    [13.39658, 52.520305], [13.397322, 52.520691], [13.397344, 52.520675],
    [13.397438, 52.520724], [13.397708, 52.520864], [13.397673, 52.520889],
    [13.397333, 52.521112], [13.397421, 52.521159], [13.397319, 52.52123],
    [13.397452, 52.521299], [13.397214, 52.521468], [13.397076, 52.521397],
    [13.396976, 52.521466], [13.396908, 52.52143], [13.396579, 52.521664],
    [13.396243, 52.52149], [13.396275, 52.521467], [13.39549, 52.521059],
    [13.395452, 52.521085], [13.395229, 52.520969]
  ];

  test('the museum survives essentially intact', () => {
    const out = simplify.simplifyGeometry({type: 'Polygon', coordinates: [PERGAMON]});
    const kept = out.coordinates[0].length;
    // The old absolute threshold left 5 points out of 32.
    expect(kept).toBeGreaterThan(25);
    expect(out.coordinates[0][0]).toEqual(PERGAMON[0]);
  });

  test('its extent is preserved to within a pixel of the drawn scale', () => {
    const out = simplify.simplifyGeometry({type: 'Polygon', coordinates: [PERGAMON]});
    const before = simplify.geometryExtent({type: 'Polygon', coordinates: [PERGAMON]});
    const after = simplify.geometryExtent(out);
    const perPixel = Math.max(before.width, before.height) / simplify.ASSUMED_RENDER_SPAN_PX;
    expect(Math.abs(after.width - before.width)).toBeLessThan(perPixel);
    expect(Math.abs(after.height - before.height)).toBeLessThan(perPixel);
  });

  test('a shape 34x larger is thinned by the same call, not the museum', () => {
    // Same outline scaled up to airport size, oversampled along every edge.
    const scaled = PERGAMON.map(([x, y]) => [
      13.4 + (x - 13.395229) * 34, 52.34 + (y - 52.520969) * 34
    ]);
    const dense = [];
    for (let i = 0; i < scaled.length - 1; i++) {
      for (let s = 0; s < 12; s++) {
        const t = s / 12;
        dense.push([
          scaled[i][0] + (scaled[i + 1][0] - scaled[i][0]) * t,
          scaled[i][1] + (scaled[i + 1][1] - scaled[i][1]) * t
        ]);
      }
    }
    dense.push(scaled[0]);
    const out = simplify.simplifyGeometry({type: 'Polygon', coordinates: [dense]});
    expect(out.coordinates[0].length).toBeLessThan(dense.length / 3);
  });
});

describe('geometryExtent and countPoints', () => {
  const RING = [[0, 0], [10, 0], [10, 5], [0, 0]];

  test('measure a Polygon', () => {
    const g = { type: 'Polygon', coordinates: [RING] };
    expect(simplify.geometryExtent(g)).toEqual({ width: 10, height: 5 });
    expect(simplify.countPoints(g)).toBe(4);
  });

  test('measure a MultiPolygon across all its parts', () => {
    const g = { type: 'MultiPolygon', coordinates: [[RING], [RING.map(([x, y]) => [x + 20, y])]] };
    expect(simplify.geometryExtent(g)).toEqual({ width: 30, height: 5 });
    expect(simplify.countPoints(g)).toBe(8);
  });

  test('report nothing for a geometry with no rings', () => {
    expect(simplify.geometryExtent({ type: 'Point', coordinates: [1, 2] })).toBeNull();
    expect(simplify.geometryExtent(null)).toBeNull();
    expect(simplify.countPoints({ type: 'Point', coordinates: [1, 2] })).toBe(0);
    expect(simplify.countPoints(null)).toBe(0);
  });

  test('ignore malformed rings rather than throwing', () => {
    const g = { type: 'Polygon', coordinates: [RING, null, [[1], 'nonsense']] };
    expect(simplify.geometryExtent(g)).toEqual({ width: 10, height: 5 });
    expect(() => simplify.countPoints(g)).not.toThrow();
  });
});
