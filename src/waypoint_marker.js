'use strict';

// Waypoint pins for the map.
//
// The start, via and end pins used to be the same teardrop in three colours,
// so anyone who cannot tell the green from the red had nothing to go on
// (issue #361). Each pin now carries a glyph as well: a dot for the start, the
// via's number, and a chequered flag for the end. Colour still separates them
// for everyone who can see it, but it is no longer the only thing that does.
//
// The pins are drawn as SVG data URIs rather than bitmaps so the glyphs stay
// sharp at any zoom or pixel density; the bitmaps they replace were 20x56 with
// no high-resolution variant despite their -2x names.

// From the Okabe-Ito palette, which is designed to stay separable under
// colour vision deficiency. The green and red these replace were the textbook
// confusable pair: simulating deuteranopia and protanopia over the old colours
// leaves the red pin and the grey via only 18.3 apart in CIE76, and the green
// and red themselves 27.3. Blue against vermillion holds a worst case of 32.8
// across normal, deuteranope, protanope and tritanope vision.
//
// Contrast against the white glyph is comfortable for all three: the via
// carries a number, which is text, and clears WCAG AA at 7.0:1; the disc and
// the flag are graphics and clear the 3:1 they need at 5.2:1 and 3.9:1.
var START_COLOUR = '#0072b2';
var END_COLOUR = '#d55e00';
var VIA_COLOUR = '#595959';

var GLYPH_COLOUR = '#ffffff';

// The pin is drawn in the top 28px and the canvas is 28px taller than that,
// as the bitmaps were. ICON_ANCHOR is the tip, which is what sits on the
// waypoint, so keeping these three numbers keeps every pin where it was.
var ICON_SIZE = [20, 56];
var ICON_ANCHOR = [10, 28];
var PIN_HEIGHT = 28;

// Teardrop: the tip at the bottom centre, opening into a circle of radius 8.5
// centred on (10, 10), which leaves an 11px well for the glyph.
var PIN_PATH = 'M10 27.5C10 27.5 1.5 17.5 1.5 10a8.5 8.5 0 1 1 17 0c0 7.5-8.5 17.5-8.5 17.5z';

function svg(body, colour) {
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + ICON_SIZE[0] + '" height="' + ICON_SIZE[1] + '" ' +
    'viewBox="0 0 ' + ICON_SIZE[0] + ' ' + ICON_SIZE[1] + '">' +
    '<path d="' + PIN_PATH + '" fill="' + colour + '" stroke="rgba(0,0,0,.25)" stroke-width="1"/>' +
    body +
    '</svg>';
}

// A plain disc. The start needs no symbol of its own — it is the pin the other
// two are read against — but it must not be an empty circle, which is what the
// via would look like without its number.
function startGlyph() {
  return '<circle cx="10" cy="10" r="4" fill="' + GLYPH_COLOUR + '"/>';
}

// The waypoint's position in the route, so a route through several vias tells
// you which is which. Past single digits the pin has no room, and the number
// is dropped rather than shrunk to something unreadable.
function viaGlyph(position) {
  if (!(position >= 1 && position <= 9)) return startGlyph();
  return '<text x="10" y="10" fill="' + GLYPH_COLOUR + '" font-size="11" font-weight="700" ' +
    'font-family="Helvetica,Arial,sans-serif" text-anchor="middle" dominant-baseline="central">' +
    position + '</text>';
}

// A chequered flag, as suggested on the issue: a 3x3 board of 3px squares in a
// white field. Finer boards were tried and lose the pattern at the size the
// pin is actually drawn — 2px squares speckle, and a 2x2 board reads as two
// separate blocks rather than a chequer.
var FLAG_CELL = 3;
var FLAG_CELLS = 3;
var FLAG_ORIGIN = 10 - (FLAG_CELL * FLAG_CELLS) / 2;

function endGlyph(colour) {
  var cells = '';
  for (var row = 0; row < FLAG_CELLS; row++) {
    for (var column = 0; column < FLAG_CELLS; column++) {
      if ((row + column) % 2 === 0) continue;
      cells += '<rect x="' + (FLAG_ORIGIN + column * FLAG_CELL) + '" y="' + (FLAG_ORIGIN + row * FLAG_CELL) +
        '" width="' + FLAG_CELL + '" height="' + FLAG_CELL + '" fill="' + colour + '"/>';
    }
  }
  var side = FLAG_CELL * FLAG_CELLS;
  return '<rect x="' + FLAG_ORIGIN + '" y="' + FLAG_ORIGIN + '" width="' + side + '" height="' + side +
    '" fill="' + GLYPH_COLOUR + '"/>' + cells;
}

function dataUri(markup) {
  return 'data:image/svg+xml,' + encodeURIComponent(markup);
}

// The Leaflet icon options for waypoint i of n, matching L.Routing's
// createMarker signature. Kept free of Leaflet so it can be tested directly.
function waypointIconOptions(i, n) {
  var markup;
  if (i === 0) {
    markup = svg(startGlyph(), START_COLOUR);
  } else if (i === n - 1) {
    markup = svg(endGlyph(END_COLOUR), END_COLOUR);
  } else {
    markup = svg(viaGlyph(i), VIA_COLOUR);
  }
  return {
    iconUrl: dataUri(markup),
    iconSize: ICON_SIZE.slice(),
    iconAnchor: ICON_ANCHOR.slice()
  };
}

module.exports = {
  waypointIconOptions: waypointIconOptions,
  START_COLOUR: START_COLOUR,
  END_COLOUR: END_COLOUR,
  VIA_COLOUR: VIA_COLOUR,
  ICON_SIZE: ICON_SIZE,
  ICON_ANCHOR: ICON_ANCHOR,
  PIN_HEIGHT: PIN_HEIGHT
};
