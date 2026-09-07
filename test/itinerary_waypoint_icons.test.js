/**
 * @jest-environment jsdom
 */
'use strict';

// The itinerary draws the same pin for a waypoint row that the map draws for
// the waypoint itself, so the two never tell a different story (issue #361).

const marker = require('../src/waypoint_marker');
const ItineraryBuilder = require('../src/itinerary_builder')('en');

function decode(backgroundImage) {
  const match = /url\("(data:image\/svg\+xml,[^"]+)"\)/.exec(backgroundImage || '');
  return match ? decodeURIComponent(match[1].slice('data:image/svg+xml,'.length)) : null;
}

function glyphOf(svg) {
  if (!svg) return null;
  if (svg.indexOf('<text') !== -1) return 'n' + /<text[^>]*>(\d)<\/text>/.exec(svg)[1];
  if (svg.indexOf('width="9" height="9"') !== -1) return 'flag';
  if (svg.indexOf('fill="none"') !== -1) return 'ring';
  if (svg.indexOf('<circle') !== -1) return 'disc';
  return '?';
}

// A step shaped enough for createStep to render a row from it.
const step = {
  maneuver: { type: 'depart' },
  distance: 10,
  duration: 5,
  mode: 'driving',
  name: 'X',
  intersections: [{ location: [13.4, 52.5], entry: [true], bearings: [0] }]
};

function render(icons) {
  const builder = new ItineraryBuilder();
  const body = builder.createStepsContainer();
  return icons.map(function(icon) {
    const row = builder.createStep(step, '100 m', icon, body);
    return glyphOf(decode(row.querySelector('.leaflet-routing-icon').style.backgroundImage));
  });
}

describe('itinerary waypoint icons', () => {
  test('depart, via and arrive rows carry the map pins', () => {
    expect(render(['depart', 'via', 'arrive'])).toEqual(['disc', 'n1', 'flag']);
  });

  test('vias are numbered in the order the rows are built', () => {
    expect(render(['depart', 'via', 'via', 'via', 'arrive']))
      .toEqual(['disc', 'n1', 'n2', 'n3', 'flag']);
  });

  test('the numbering restarts for a freshly drawn itinerary', () => {
    // Leaflet Routing Machine builds a container per render; if the count
    // outlived it, redrawing a route would number the same vias 4, 5, 6.
    const first = render(['depart', 'via', 'via', 'arrive']);
    const second = render(['depart', 'via', 'via', 'arrive']);
    expect(second).toEqual(first);
  });

  test('turn rows are left to the sprite', () => {
    const builder = new ItineraryBuilder();
    const body = builder.createStepsContainer();
    const row = builder.createStep(step, '100 m', 'turn-left', body);
    const span = row.querySelector('.leaflet-routing-icon');
    expect(span.style.backgroundImage).toBe('');
    expect(span.className).toContain('leaflet-routing-icon-turn-left');
  });

  test('the row icon is the same drawing the map uses for that waypoint', () => {
    // start, via 1, end of a three-waypoint route
    const mapStart = decodeURIComponent(marker.waypointIconOptions(0, 3).iconUrl.slice(19));
    const mapVia = decodeURIComponent(marker.waypointIconOptions(1, 3).iconUrl.slice(19));
    const mapEnd = decodeURIComponent(marker.waypointIconOptions(2, 3).iconUrl.slice(19));
    const rows = ['depart', 'via', 'arrive'];
    const builder = new ItineraryBuilder();
    const body = builder.createStepsContainer();
    const panel = rows.map(function(icon) {
      const row = builder.createStep(step, '100 m', icon, body);
      return decode(row.querySelector('.leaflet-routing-icon').style.backgroundImage);
    });
    // Same glyphs and colours; only the canvas height differs, because the map
    // pin keeps the taller canvas its anchor is measured against.
    const body_ = (svg) => svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
    expect(body_(panel[0])).toBe(body_(mapStart));
    expect(body_(panel[1])).toBe(body_(mapVia));
    expect(body_(panel[2])).toBe(body_(mapEnd));
  });
});
