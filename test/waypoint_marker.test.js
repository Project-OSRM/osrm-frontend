'use strict';

// Start, via and end pins have to differ by more than colour, so that someone
// who cannot tell the green from the red can still read the route (issue #361).
// These tests are about the glyphs, not the palette.

const marker = require('../src/waypoint_marker');

// The icons are SVG data URIs; decode one back to markup to inspect it.
function markup(i, n) {
  const options = marker.waypointIconOptions(i, n);
  expect(options.iconUrl.startsWith('data:image/svg+xml,')).toBe(true);
  return decodeURIComponent(options.iconUrl.slice('data:image/svg+xml,'.length));
}

describe('waypoint pin geometry', () => {
  test('every pin keeps the size and anchor of the bitmaps it replaces', () => {
    // The anchor is the tip of the pin, so changing these moves every marker
    // off its waypoint.
    for (const [i, n] of [[0, 2], [1, 2], [1, 3], [0, 5], [4, 5]]) {
      const options = marker.waypointIconOptions(i, n);
      expect(options.iconSize).toEqual([20, 56]);
      expect(options.iconAnchor).toEqual([10, 28]);
    }
  });

  test('the returned arrays are copies, so a caller cannot reshape later pins', () => {
    const first = marker.waypointIconOptions(0, 2);
    first.iconSize[0] = 999;
    expect(marker.waypointIconOptions(0, 2).iconSize).toEqual([20, 56]);
  });
});

describe('waypoint pins differ by glyph, not only colour', () => {
  test('start, via and end are three different images', () => {
    const start = marker.waypointIconOptions(0, 3).iconUrl;
    const via = marker.waypointIconOptions(1, 3).iconUrl;
    const end = marker.waypointIconOptions(2, 3).iconUrl;
    expect(new Set([start, via, end]).size).toBe(3);
  });

  test('they still differ once colour is taken away', () => {
    // Strip every fill: what is left is shape alone, which is what a
    // colourblind user is reading.
    const shapeOf = (i, n) => markup(i, n).replace(/fill="[^"]*"/g, '');
    const start = shapeOf(0, 3);
    const via = shapeOf(1, 3);
    const end = shapeOf(2, 3);
    expect(start).not.toBe(via);
    expect(via).not.toBe(end);
    expect(start).not.toBe(end);
  });

  test('the end pin carries a chequered flag', () => {
    const end = markup(2, 3);
    // A 3x3 board alternating from a white field: four squares are drawn over it.
    const squares = end.match(/<rect [^>]*width="3"/g) || [];
    expect(squares.length).toBe(4);
    expect(end).toContain('width="9" height="9"');
  });

  test('the start pin is a plain disc, with no flag and no number', () => {
    const start = markup(0, 3);
    expect(start).toContain('<circle');
    expect(start).not.toContain('<text');
    expect(start).not.toContain('width="3"');
  });
});

describe('via pins are numbered by position', () => {
  test('each via shows its own number', () => {
    // start, via 1, via 2, via 3, end
    expect(markup(1, 5)).toContain('>1</text>');
    expect(markup(2, 5)).toContain('>2</text>');
    expect(markup(3, 5)).toContain('>3</text>');
  });

  test('a route with no via has only a start and an end', () => {
    expect(markup(0, 2)).toContain('<circle');
    expect(markup(1, 2)).toContain('width="9" height="9"');
  });

  test('past nine vias the number gives way to a ring, not to the start disc', () => {
    // Falling back to the start's glyph would make a via identical to the
    // start once colour is gone, reintroducing the bug this module fixes.
    const tenth = markup(10, 20);
    expect(tenth).not.toContain('<text');
    expect(tenth).toContain('stroke-width="2"');
    expect(tenth).toContain('fill="none"');
  });

  test('an unnumbered via is still distinguishable from the start without colour', () => {
    const shapeOf = (i, n) => markup(i, n).replace(/fill="[^"]*"/g, '');
    expect(shapeOf(10, 20)).not.toBe(shapeOf(0, 20));
  });

  test('the last waypoint is the end even when it could be a via', () => {
    // i === n - 1 wins over the via branch.
    expect(markup(4, 5)).toContain('width="9" height="9"');
    expect(markup(4, 5)).not.toContain('<text');
  });
});

describe('the markup is a usable SVG', () => {
  test('it declares the SVG namespace and the viewBox the anchor assumes', () => {
    const svg = markup(0, 2);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('viewBox="0 0 20 56"');
  });

  test('the data URI is encoded, so a # in a colour cannot truncate it', () => {
    // An unencoded '#' would end the URL at the first fill colour and the pin
    // would silently render as nothing.
    const url = marker.waypointIconOptions(0, 2).iconUrl;
    expect(url).not.toContain('#');
    expect(url).toContain('%23');
  });

  test('the URI has no bare parenthesis, which would end a CSS url() early', () => {
    // The itinerary sets these as a background-image, where a ')' inside the
    // value truncates it; encodeURIComponent does not escape parentheses.
    for (const [i, n] of [[0, 4], [1, 4], [2, 4], [3, 4], [10, 20]]) {
      expect(marker.waypointIconOptions(i, n).iconUrl).not.toMatch(/[()]/);
    }
    expect(marker.panelIconUrl(marker.VIA, 2)).not.toMatch(/[()]/);
  });
});
