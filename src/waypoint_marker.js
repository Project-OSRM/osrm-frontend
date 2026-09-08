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

// What a waypoint is, independent of its index.
var START = 'start';
var VIA = 'via';
var END = 'end';

// The pin is drawn in the top 28px and the canvas is 28px taller than that,
// as the bitmaps were. ICON_ANCHOR is the tip, which is what sits on the
// waypoint, so keeping these three numbers keeps every pin where it was.
var ICON_SIZE = [20, 56];
var ICON_ANCHOR = [10, 28];
var PIN_HEIGHT = 28;

// Where the glyph sits. The pin's widest point is y=10, the centre of the
// circle the teardrop opens into, but the shape carries on below it before it
// tapers, so a glyph centred there reads high: the filled area's centroid is
// y=12.6 and the part of the pin at least 60% as wide as its widest row spans
// y=3.2 to y=20.1, with its middle at 11.65. y=11 is the whole pixel nearest
// that middle; y=12 crowds the flag against the taper.
var GLYPH_CENTRE_Y = 11;

// Teardrop: the tip at the bottom centre, opening into a circle of radius 8.5
// centred on (10, 10), which leaves an 11px well for the glyph.
var PIN_PATH = 'M10 27.5C10 27.5 1.5 17.5 1.5 10a8.5 8.5 0 1 1 17 0c0 7.5-8.5 17.5-8.5 17.5z';

// height is the canvas the pin is drawn on. The map pin keeps the bitmaps'
// 56px canvas because its anchor is measured against it; the itinerary draws
// the same pin on a 28px canvas, which is the pin itself with the empty half
// below it trimmed away so it fills the row's icon slot.
function svg(body, colour, height) {
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + ICON_SIZE[0] + '" height="' + height + '" ' +
    'viewBox="0 0 ' + ICON_SIZE[0] + ' ' + height + '">' +
    // stroke-opacity rather than rgba(): encodeURIComponent leaves parentheses
    // alone, and a bare ')' inside a CSS url() ends the value early.
    '<path d="' + PIN_PATH + '" fill="' + colour + '" stroke="#000000" stroke-opacity=".25" stroke-width="1"/>' +
    body +
    '</svg>';
}

// A filled disc for the start. Its radius puts every edge on a whole pixel,
// which keeps it crisp where the device draws one image pixel per CSS pixel.
function startGlyph() {
  return '<circle cx="10" cy="' + GLYPH_CENTRE_Y + '" r="4" fill="' + GLYPH_COLOUR + '"/>';
}

// A ring, for a via too far along the route to number. It has to be a shape of
// its own rather than the start's disc: falling back to the disc would leave
// the via and the start identical once colour is taken away, which is the
// failure this module exists to fix. Radius and width keep the edges whole.
function unnumberedViaGlyph() {
  return '<circle cx="10" cy="' + GLYPH_CENTRE_Y + '" r="4" fill="none" stroke="' + GLYPH_COLOUR + '" stroke-width="2"/>';
}

// The waypoint's position in the route, so a route through several vias tells
// you which is which. Past single digits the pin has no room for the number,
// and it gives way to the ring rather than being shrunk past reading.
function viaGlyph(position) {
  if (!(position >= 1 && position <= 9)) return unnumberedViaGlyph();
  return '<text x="10" y="' + GLYPH_CENTRE_Y + '" fill="' + GLYPH_COLOUR + '" font-size="11" font-weight="700" ' +
    'font-family="Helvetica,Arial,sans-serif" text-anchor="middle" dominant-baseline="central">' +
    position + '</text>';
}

// A chequered flag, as suggested on the issue: a 5x5 board of 2px squares in
// a white field.
//
// The board has to be centred on the pin and land on whole pixels. Half-pixel
// edges are resampled wherever the device draws one image pixel per CSS pixel,
// which smears about 40% of the flag into greys, so an even-sided board is the
// only way to have both: an odd one cannot be centred on x=10 without a half
// pixel. A 10px board of 2px squares reads as a chequer at the size the pin is
// drawn; 8px is sparser, and a board of 2 or 3 squares a side reads as a few
// blocks rather than a pattern.
var FLAG_CELL = 2;
var FLAG_CELLS = 5;
var FLAG_FIELD = FLAG_CELL * FLAG_CELLS;
var FLAG_ORIGIN = 10 - FLAG_FIELD / 2;
var FLAG_ORIGIN_Y = GLYPH_CENTRE_Y - FLAG_FIELD / 2;

function endGlyph(colour) {
  var cells = '';
  for (var row = 0; row < FLAG_CELLS; row++) {
    for (var column = 0; column < FLAG_CELLS; column++) {
      if ((row + column) % 2 === 0) continue;
      cells += '<rect x="' + (FLAG_ORIGIN + column * FLAG_CELL) + '" y="' + (FLAG_ORIGIN_Y + row * FLAG_CELL) +
        '" width="' + FLAG_CELL + '" height="' + FLAG_CELL + '" fill="' + colour + '"/>';
    }
  }
  return '<rect x="' + FLAG_ORIGIN + '" y="' + FLAG_ORIGIN_Y + '" width="' + FLAG_FIELD + '" height="' + FLAG_FIELD +
    '" fill="' + GLYPH_COLOUR + '"/>' + cells;
}

function dataUri(markup) {
  return 'data:image/svg+xml,' + encodeURIComponent(markup);
}

// One pin, by what the waypoint is rather than where it sits in a list, so
// the map and the itinerary can ask for the same drawing. position numbers a
// via and is ignored otherwise.
function pinMarkup(kind, position, height) {
  if (kind === START) return svg(startGlyph(), START_COLOUR, height);
  if (kind === END) return svg(endGlyph(END_COLOUR), END_COLOUR, height);
  return svg(viaGlyph(position), VIA_COLOUR, height);
}

function kindOf(i, n) {
  if (i === 0) return START;
  if (i === n - 1) return END;
  return VIA;
}

// The Leaflet icon options for waypoint i of n, matching L.Routing's
// createMarker signature. Kept free of Leaflet so it can be tested directly.
function waypointIconOptions(i, n) {
  return {
    iconUrl: dataUri(pinMarkup(kindOf(i, n), i, ICON_SIZE[1])),
    iconSize: ICON_SIZE.slice(),
    iconAnchor: ICON_ANCHOR.slice()
  };
}

// The same pin for an itinerary row, trimmed to the pin itself. The row knows
// what the waypoint is and, for a via, which one; it does not know how many
// waypoints the route has, so it says so directly rather than as i of n.
function panelIconUrl(kind, position) {
  return dataUri(pinMarkup(kind, position, PIN_HEIGHT));
}

// The same panel pin for waypoint i of n, for a row that does know how many
// waypoints there are: the input rows.
function panelIconUrlFor(i, n) {
  return panelIconUrl(kindOf(i, n), i);
}

module.exports = {
  waypointIconOptions: waypointIconOptions,
  panelIconUrl: panelIconUrl,
  panelIconUrlFor: panelIconUrlFor,
  START: START,
  VIA: VIA,
  END: END,
  START_COLOUR: START_COLOUR,
  END_COLOUR: END_COLOUR,
  VIA_COLOUR: VIA_COLOUR,
  FLAG_CELL: FLAG_CELL,
  FLAG_FIELD: FLAG_FIELD,
  FLAG_ORIGIN: FLAG_ORIGIN,
  FLAG_ORIGIN_Y: FLAG_ORIGIN_Y,
  GLYPH_CENTRE_Y: GLYPH_CENTRE_Y,
  ICON_SIZE: ICON_SIZE,
  ICON_ANCHOR: ICON_ANCHOR,
  PIN_HEIGHT: PIN_HEIGHT
};
