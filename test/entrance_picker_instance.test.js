/**
 * @jest-environment jsdom
 */
'use strict';

/**
 * Behaviour of the live picker — the half that talks to Leaflet: which dots get
 * drawn, what a click does, and what is torn down on close. The pure helpers
 * are covered in entrance_picker.test.js.
 *
 * Leaflet is faked rather than loaded: the real thing needs a DOM, and what
 * matters here is the sequence of calls the picker makes, not Leaflet's own
 * rendering.
 */

function mockMakeLayerGroup(children) {
  return {
    _kind: 'layerGroup',
    _layers: (children || []).slice(),
    addLayer(l) { this._layers.push(l); return this; },
    clearLayers() { this._layers = []; return this; },
    addTo(map) { map._layers.push(this); return this; }
  };
}

function mockMakeBounds(points) {
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  return {
    _kind: 'bounds',
    _points: points,
    isValid: () => points.length > 0,
    getSouthWest: () => ({ lat: Math.min(...lats), lng: Math.min(...lngs) }),
    getNorthEast: () => ({ lat: Math.max(...lats), lng: Math.max(...lngs) })
  };
}

jest.mock('leaflet', () => ({
  layerGroup: (children) => mockMakeLayerGroup(children),
  latLngBounds: (points) => mockMakeBounds(points),
  point: (x, y) => ({ x, y }),
  divIcon: (opts) => ({ _kind: 'divIcon', options: opts }),
  polyline: (points, style) => ({ _kind: 'polyline', points, style }),
  geoJSON: (geometry, opts) => ({ _kind: 'geoJSON', geometry, options: opts }),
  DomEvent: { stopPropagation: jest.fn() },
  marker: (latLng, opts) => ({
    _kind: 'marker',
    latLng,
    options: opts,
    handlers: {},
    getLatLng() { return this.latLng; },
    // Mimics enough of the label element for the layout pass to measure it.
    // Boxes are keyed by the door's name, so the mark glyph is stripped with
    // the markup.
    getElement() {
      const html = (this.options.icon && this.options.icon.options.html) || '';
      const text = html
        .replace(/<span class="osrm-entrance-mark[^>]*>[^<]*<\/span>/g, '')
        .replace(/<[^>]*>/g, '');
      const boxes = require('./__label_boxes');
      const box = boxes.get(text);
      return {
        querySelector: (sel) => (sel === '.osrm-entrance-label-inner' && box
          ? { getBoundingClientRect: () => box }
          : null)
      };
    },
    on(evt, fn) { this.handlers[evt] = fn; return this; },
    fire(evt, e) { this.handlers[evt] && this.handlers[evt](e || {}); }
  })
}));

const entrancePicker = require('../src/entrance_picker');

const makeBounds = mockMakeBounds;

// The projection is a plain scaling of lat/lng, which is all the framing
// arithmetic needs: what matters is relative distances, not the real Mercator.
function makeMap(overrides) {
  const o = Object.assign({
    size: { x: 1200, y: 800 },
    pixelsPerDegree: 10000,
    center: { lat: 52.5209336, lng: 13.3956302 }
  }, overrides);
  return {
    _layers: [],
    _handlers: {},
    _panes: {},
    getSize: () => o.size,
    latLngToContainerPoint: (ll) => ({
      x: o.size.x / 2 + (ll.lng - o.center.lng) * o.pixelsPerDegree,
      y: o.size.y / 2 - (ll.lat - o.center.lat) * o.pixelsPerDegree
    }),
    project: (ll, zoom) => ({
      x: ll.lng * o.pixelsPerDegree * (zoom || 1),
      y: -ll.lat * o.pixelsPerDegree * (zoom || 1)
    }),
    getBoundsZoom: jest.fn(() => (o.boundsZoom !== undefined ? o.boundsZoom : 1)),
    getPane(name) { return this._panes[name]; },
    createPane(name) { this._panes[name] = { style: {} }; return this._panes[name]; },
    fitBounds: jest.fn(),
    on(evt, fn) { (this._handlers[evt] = this._handlers[evt] || []).push(fn); },
    off(evt, fn) {
      this._handlers[evt] = (this._handlers[evt] || []).filter((f) => f !== fn);
    },
    fire(evt) { (this._handlers[evt] || []).slice().forEach((f) => f()); },
    hasLayer(l) { return this._layers.indexOf(l) !== -1; },
    removeLayer(l) { this._layers = this._layers.filter((x) => x !== l); }
  };
}

const CENTRE = { lat: 52.5209336, lng: 13.3956302 };
const MAIN = { osmId: 1, type: 'main', center: { lat: 52.5209566, lng: 13.3965227 } };
const SIDE = { osmId: 2, type: 'yes', center: { lat: 52.5207240, lng: 13.3974377 } };

function openPicker(showOpts, options, mapOverrides) {
  const map = makeMap(mapOverrides);
  const onSelect = jest.fn();
  const picker = entrancePicker.createEntrancePicker(
    map, Object.assign({ onSelect }, options));
  const opened = picker.show(Object.assign({
    waypointIndex: 1,
    placeName: 'Pergamonmuseum',
    placeCenter: CENTRE,
    entrances: [MAIN, SIDE]
  }, showOpts));
  return { map, picker, onSelect, opened };
}

// The picker's own layer group; its members are indexed by the helpers below.
function pickerGroup(map) {
  return map._layers.filter((l) => l._kind === 'layerGroup' && l._layers.length === 4)[0];
}

function outlines(map) {
  const g = pickerGroup(map);
  return g ? g._layers[0]._layers : [];
}

function links(map) {
  const g = pickerGroup(map);
  return g ? g._layers[1]._layers : [];
}

function labels(map) {
  const g = pickerGroup(map);
  return g ? g._layers[2]._layers : [];
}

// The names a label shows, with any mark glyph stripped — the marks are
// asserted on the markup itself.
function labelTexts(map) {
  return labels(map).map((m) => m.options.icon.options.html
    .replace(/<span class="osrm-entrance-mark[^>]*>[^<]*<\/span>/g, '')
    .replace(/<[^>]*>/g, ''));
}

function dots(map) {
  const g = pickerGroup(map);
  return g ? g._layers[3]._layers : [];
}

beforeEach(() => jest.useFakeTimers());

afterEach(() => {
  jest.useRealTimers();
  document.body.innerHTML = '';
});

// The picker waits for the map to settle before framing, so a test that cares
// about the framing runs the timers first.
function settle() {
  jest.advanceTimersByTime(500);
}

describe('show', () => {
  test('draws one dot per door and puts the layer on the map', () => {
    const { map, picker, opened } = openPicker();
    expect(opened).toBe(true);
    expect(picker.isOpen()).toBe(true);
    expect(dots(map).map((m) => m.latLng)).toEqual([MAIN.center, SIDE.center]);
  });

  test('a main door is drawn differently from any other', () => {
    const { map } = openPicker();
    expect(dots(map)[0].options.icon.options.className)
      .toContain('osrm-entrance-marker-main');
    expect(dots(map)[1].options.icon.options.className)
      .toContain('osrm-entrance-marker-other');
  });

  // The pin already marks the place, so one dot is a real choice rather than a
  // foregone one.
  test('a single door is still worth offering', () => {
    const { map, opened } = openPicker({ entrances: [MAIN] });
    expect(opened).toBe(true);
    expect(dots(map)).toHaveLength(1);
  });

  test('a place with no doors opens nothing', () => {
    const { picker, opened } = openPicker({ entrances: [] });
    expect(opened).toBe(false);
    expect(picker.isOpen()).toBe(false);
  });

  test('nothing is chosen until the user chooses it', () => {
    const { map, picker } = openPicker();
    expect(picker.getSelectedId()).toBeNull();
    expect(dots(map).some((m) => m.options.icon.options.className.includes('selected')))
      .toBe(false);
    expect(links(map)).toHaveLength(0);
  });

  test('the offer knows which waypoint it belongs to', () => {
    const { picker } = openPicker({ waypointIndex: 2 });
    expect(picker.getWaypointIndex()).toBe(2);
  });

  test('a named door carries its name for assistive technology', () => {
    const named = Object.assign({}, MAIN, { tags: { name: 'Haupteingang' } });
    const { map } = openPicker({ entrances: [named] });
    expect(dots(map)[0].options.alt).toBe('Haupteingang');
  });

  // The doors are metres apart on a site the map is showing from kilometres
  // away; without this the offer is a cluster nobody can aim at.
  test('brings the doors into view', () => {
    const { map } = openPicker();
    settle();
    expect(map.fitBounds).toHaveBeenCalledTimes(1);
    expect(map.fitBounds.mock.calls[0][0]._points)
      .toEqual([MAIN.center, SIDE.center]);
  });

  // One door spans nothing, so the pin has to be in the frame or there is
  // nothing to frame against.
  test('a lone door is framed together with the pin', () => {
    const { map } = openPicker({ entrances: [MAIN] });
    settle();
    expect(map.fitBounds.mock.calls[0][0]._points).toEqual([MAIN.center, CENTRE]);
  });

  // The route to the place arrives just after the geocode that opened the
  // offer, and fitting it would undo a framing issued on top of it.
  test('frames once the map settles, not immediately', () => {
    const { map } = openPicker();
    expect(map.fitBounds).not.toHaveBeenCalled();
    settle();
    expect(map.fitBounds).toHaveBeenCalledTimes(1);
  });

  // Half an offer hidden behind the directions pane is half an offer.
  test('frames the doors into the part of the map the pane does not cover', () => {
    const { map } = openPicker(null, { paneWidth: () => 400 });
    settle();
    const opts = map.fitBounds.mock.calls[0][1];
    expect(opts.paddingBottomRight.x).toBeGreaterThan(400);
    expect(opts.paddingTopLeft.x).toBeLessThan(400);
  });

  test('a moveend frames without waiting for the backstop timer', () => {
    const { map } = openPicker();
    map.fire('moveend');
    expect(map.fitBounds).toHaveBeenCalledTimes(1);
    settle();
    expect(map.fitBounds).toHaveBeenCalledTimes(1);
  });
});

describe('choosing a door', () => {
  test('routes to the door while the pin stays on the place', () => {
    const { map, onSelect } = openPicker();
    dots(map)[0].fire('click');
    expect(onSelect).toHaveBeenCalledWith({
      waypointIndex: 1,
      placeName: 'Pergamonmuseum',
      latLng: MAIN.center,
      markerLatLng: CENTRE,
      entrance: MAIN
    });
  });

  test('the chosen door is marked, and every other stays one click away', () => {
    const { map, picker } = openPicker();
    dots(map)[0].fire('click');
    expect(picker.getSelectedId()).toBe('osm:1');
    expect(dots(map)).toHaveLength(2);
    expect(dots(map)[0].options.icon.options.className)
      .toContain('osrm-entrance-marker-selected');
    expect(dots(map)[1].options.icon.options.className)
      .not.toContain('osrm-entrance-marker-selected');
  });

  test('a dashed line ties the chosen door back to the pin', () => {
    const { map } = openPicker();
    expect(links(map)).toHaveLength(0);
    dots(map)[0].fire('click');
    expect(links(map)).toHaveLength(1);
    expect(links(map)[0].points).toEqual([MAIN.center, CENTRE]);
    expect(links(map)[0].style.dashArray).toBeTruthy();
  });

  // There is no separate dot for the centre: the pin is already sitting on it.
  test('clicking the chosen door again routes back to the place', () => {
    const { map, picker, onSelect } = openPicker();
    dots(map)[0].fire('click');
    dots(map)[0].fire('click');
    expect(picker.getSelectedId()).toBeNull();
    expect(links(map)).toHaveLength(0);
    expect(onSelect).toHaveBeenLastCalledWith(expect.objectContaining({
      latLng: CENTRE,
      entrance: null
    }));
  });

  test('choosing another door moves the choice rather than adding one', () => {
    const { map, picker, onSelect } = openPicker();
    dots(map)[0].fire('click');
    dots(map)[1].fire('click');
    expect(picker.getSelectedId()).toBe('osm:2');
    expect(links(map)).toHaveLength(1);
    expect(onSelect).toHaveBeenLastCalledWith(expect.objectContaining({
      latLng: SIDE.center,
      entrance: SIDE
    }));
  });

  // Without this the click also lands on the map, which drops a new waypoint
  // on top of the place being chosen for.
  test('the click does not fall through to the map', () => {
    const L = require('leaflet');
    const { map } = openPicker();
    L.DomEvent.stopPropagation.mockClear();
    const event = { fake: 'event' };
    dots(map)[0].fire('click', event);
    expect(L.DomEvent.stopPropagation).toHaveBeenCalledWith(event);
  });

  test('a click arriving after the picker closed does nothing', () => {
    const { map, picker, onSelect } = openPicker();
    const stale = dots(map)[0];
    picker.hide();
    stale.fire('click');
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe('closing', () => {
  test('Escape closes the offer', () => {
    const { picker } = openPicker();
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
    expect(picker.isOpen()).toBe(false);
  });

  test('another key leaves it open', () => {
    const { picker } = openPicker();
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'a' }));
    expect(picker.isOpen()).toBe(true);
  });

  test('hide leaves nothing on the map and stops listening', () => {
    const { map, picker } = openPicker();
    const group = pickerGroup(map);
    picker.hide();
    expect(map.hasLayer(group)).toBe(false);
    expect(group._layers.every((l) => l._layers.length === 0)).toBe(true);
    expect(picker.getWaypointIndex()).toBeNull();
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
    expect(picker.isOpen()).toBe(false);
  });

  test('hiding twice is harmless', () => {
    const { picker } = openPicker();
    picker.hide();
    expect(() => picker.hide()).not.toThrow();
  });

  test('re-showing puts the offer back on the map', () => {
    const { map, picker } = openPicker();
    picker.hide();
    picker.show({ waypointIndex: 0, placeCenter: CENTRE, entrances: [MAIN] });
    expect(picker.isOpen()).toBe(true);
    expect(dots(map)).toHaveLength(1);
  });

  test('a picker closed before the map settled never frames', () => {
    const { map, picker } = openPicker();
    picker.hide();
    settle();
    expect(map.fitBounds).not.toHaveBeenCalled();
  });
});

describe('label placement', () => {
  const labelBoxes = require('./__label_boxes');
  const box = (l, t, r, b) => ({ left: l, top: t, right: r, bottom: b });

  const NAMED = [
    { osmId: 1, type: 'main', center: { lat: 52.5209, lng: 13.3965 }, tags: { name: 'Nord' } },
    { osmId: 2, type: 'yes', center: { lat: 52.5208, lng: 13.3970 }, tags: { name: 'Ost' } },
    { osmId: 3, type: 'yes', center: { lat: 52.5207, lng: 13.3975 }, tags: { name: 'Sued' } }
  ];

  afterEach(() => labelBoxes.clear());

  // Opens the picker with the given per-label boxes already in place, so the
  // layout pass measures them as it runs.
  function openWith(boxesByText, entrances) {
    labelBoxes.set(boxesByText);
    return openPicker({ entrances: entrances || NAMED });
  }

  const SPREAD = { Nord: box(0, 0, 40, 16), Ost: box(100, 0, 140, 16), Sued: box(200, 0, 240, 16) };
  const COLLIDING = { Nord: box(0, 0, 40, 16), Ost: box(20, 0, 60, 16), Sued: box(200, 0, 240, 16) };

  test('every door names itself when the labels all fit', () => {
    const { map } = openWith(SPREAD);
    expect(labelTexts(map)).toEqual(['Nord', 'Ost', 'Sued']);
  });

  test('an unnamed door is described by what it is', () => {
    const { map } = openWith({ 'Main entrance': box(0, 0, 40, 16), Entrance: box(100, 0, 140, 16) },
      [MAIN, SIDE]);
    expect(labelTexts(map)).toEqual(['Main entrance', 'Entrance']);
  });

  test('an exit is labelled an exit, not an entrance', () => {
    const exit = { osmId: 9, type: 'exit', center: MAIN.center };
    const { map } = openWith({ Exit: box(0, 0, 40, 16) }, [exit]);
    expect(labelTexts(map)).toEqual(['Exit']);
  });

  test('the wording goes through the translator', () => {
    labelBoxes.set({ Haupteingang: box(0, 0, 60, 16) });
    const { map } = openPicker({ entrances: [MAIN] },
      { translate: (key) => ({ 'Main entrance': 'Haupteingang' })[key] || key });
    expect(labelTexts(map)).toEqual(['Haupteingang']);
  });

  test('a colliding run collapses into one label listing every door in it', () => {
    const { map } = openWith(COLLIDING);
    // Two labels now: the merged run, and the one that still fits.
    expect(labelTexts(map)).toEqual(['NordOst', 'Sued']);
  });

  test('the merged label is marked as such, and anchored on the first door', () => {
    const { map } = openWith(COLLIDING);
    const merged = labels(map)[0];
    expect(merged.options.icon.options.className).toContain('osrm-entrance-label-merged');
    expect(merged.latLng).toBe(NAMED[0].center);
    expect(labels(map)[1].options.icon.options.className)
      .not.toContain('osrm-entrance-label-merged');
  });

  test('everything colliding at once becomes a single label', () => {
    const { map } = openWith({
      Nord: box(0, 0, 40, 16), Ost: box(30, 0, 70, 16), Sued: box(60, 0, 100, 16)
    });
    expect(labelTexts(map)).toEqual(['NordOstSued']);
  });

  test('labels are drawn beneath the dots, in a pane of their own', () => {
    const { map } = openWith(SPREAD);
    expect(map._panes.osrmEntranceLabels).toBeTruthy();
    expect(labels(map).every((m) => m.options.pane === 'osrmEntranceLabels')).toBe(true);
    expect(labels(map).every((m) => m.options.zIndexOffset < dots(map)[0].options.zIndexOffset))
      .toBe(true);
  });

  test('the pane is made once and reused', () => {
    const { map, picker } = openWith(SPREAD);
    const pane = map._panes.osrmEntranceLabels;
    picker.layoutLabels();
    expect(map._panes.osrmEntranceLabels).toBe(pane);
  });

  test('a map that cannot make the pane still gets its labels', () => {
    labelBoxes.set(SPREAD);
    const map = makeMap();
    map.createPane = () => null;
    const picker = entrancePicker.createEntrancePicker(map, {});
    picker.show({ waypointIndex: 1, placeCenter: CENTRE, entrances: NAMED });
    expect(labels(map)).toHaveLength(3);
    // Never a pane name that names nothing.
    expect(labels(map).every((m) => m.options.pane === undefined)).toBe(true);
  });

  test('names go in as text, so OSM cannot inject markup', () => {
    const nasty = '<img src=x onerror=alert(1)>';
    const { map } = openWith(
      { [nasty]: box(0, 0, 40, 16), Ost: box(100, 0, 140, 16) },
      [Object.assign({}, NAMED[0], { tags: { name: nasty } }), NAMED[1]]
    );
    const html = labels(map)[0].options.icon.options.html;
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  test('quotes and ampersands in a name are escaped too', () => {
    const name = 'Tor "A" & B';
    const { map } = openWith({ [name]: box(0, 0, 40, 16) },
      [Object.assign({}, NAMED[0], { tags: { name: name } })]);
    const html = labels(map)[0].options.icon.options.html;
    expect(html).toContain('&amp;');
    expect(html).toContain('&quot;');
    expect(html).not.toContain('"A"');
  });

  test('gives up rather than guessing when a label cannot be measured', () => {
    // Nothing measurable: the layout pass leaves one label per door.
    const { map } = openWith({});
    expect(labelTexts(map)).toEqual(['Nord', 'Ost', 'Sued']);
  });

  test('a zoom lays the labels out again, because which ones fit is a zoom question', () => {
    const { map } = openWith(SPREAD);
    expect(labelTexts(map)).toEqual(['Nord', 'Ost', 'Sued']);
    labelBoxes.set(COLLIDING);
    map.fire('zoomend');
    expect(labelTexts(map)).toEqual(['NordOst', 'Sued']);
  });

  test('closing leaves no labels behind and stops relaying them out', () => {
    const { map, picker } = openWith(SPREAD);
    const group = pickerGroup(map);
    picker.hide();
    expect(group._layers[1]._layers).toHaveLength(0);
    expect(map._handlers.zoomend || []).toHaveLength(0);
  });
});

describe('clicking a label', () => {
  const labelBoxes = require('./__label_boxes');
  const box = (l, t, r, b) => ({ left: l, top: t, right: r, bottom: b });

  const NAMED = [
    { osmId: 1, type: 'main', center: { lat: 52.5209, lng: 13.3965 }, tags: { name: 'Nord' } },
    { osmId: 2, type: 'yes', center: { lat: 52.5208, lng: 13.3970 }, tags: { name: 'Ost' } }
  ];

  afterEach(() => labelBoxes.clear());

  // A merged label's lines are the inner span's children; a click carries the
  // element it landed on, which knows its parent's children.
  function lineTarget(lineIndex, lineCount) {
    const lines = [];
    for (let i = 0; i < lineCount; i++) lines.push({ parentNode: null });
    const parent = { children: lines };
    lines.forEach((line) => { line.parentNode = parent; });
    return { closest: (sel) => (sel === '.osrm-entrance-label-inner > div' ? lines[lineIndex] : null) };
  }

  test('a label stands in for its door', () => {
    labelBoxes.set({ Nord: box(0, 0, 40, 16), Ost: box(100, 0, 140, 16) });
    const { map, onSelect } = openPicker({ entrances: NAMED });
    labels(map)[1].fire('click', { originalEvent: { target: {} } });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0].entrance).toBe(NAMED[1]);
  });

  test('the click does not fall through to the map', () => {
    const L = require('leaflet');
    labelBoxes.set({ Nord: box(0, 0, 40, 16), Ost: box(100, 0, 140, 16) });
    const { map } = openPicker({ entrances: NAMED });
    L.DomEvent.stopPropagation.mockClear();
    const event = { originalEvent: { target: {} } };
    labels(map)[0].fire('click', event);
    expect(L.DomEvent.stopPropagation).toHaveBeenCalledWith(event);
  });

  // The doors in a merged label are the ones too close together to aim at, so
  // its lines are the only way to reach them.
  test('a line of a merged label picks that door', () => {
    labelBoxes.set({ Nord: box(0, 0, 40, 16), Ost: box(20, 0, 60, 16) });
    const { map, onSelect } = openPicker({ entrances: NAMED });
    expect(labelTexts(map)).toEqual(['NordOst']);
    labels(map)[0].fire('click', { originalEvent: { target: lineTarget(1, 2) } });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0].entrance).toBe(NAMED[1]);
  });

  test('a click that misses every line picks nothing', () => {
    labelBoxes.set({ Nord: box(0, 0, 40, 16), Ost: box(20, 0, 60, 16) });
    const { map, onSelect } = openPicker({ entrances: NAMED });
    labels(map)[0].fire('click', { originalEvent: { target: { closest: () => null } } });
    labels(map)[0].fire('click', {});
    expect(onSelect).not.toHaveBeenCalled();
  });

  test('the chosen door\'s line is marked, and unmarked when it is released', () => {
    labelBoxes.set({ Nord: box(0, 0, 40, 16), Ost: box(20, 0, 60, 16) });
    const { map } = openPicker({ entrances: NAMED });
    dots(map)[1].fire('click');
    const html = labels(map)[0].options.icon.options.html;
    expect(html).toContain('<div>Nord</div>');
    expect(html).toContain('<div class="osrm-entrance-label-selected">Ost</div>');

    dots(map)[1].fire('click');
    expect(labels(map)[0].options.icon.options.html)
      .not.toContain('osrm-entrance-label-selected');
  });

  test('labels do not take keyboard focus, which stays with the dots', () => {
    labelBoxes.set({ Nord: box(0, 0, 40, 16), Ost: box(100, 0, 140, 16) });
    const { map } = openPicker({ entrances: NAMED });
    expect(labels(map).every((m) => m.options.keyboard === false)).toBe(true);
  });
});

describe('marks on the map', () => {
  const labelBoxes = require('./__label_boxes');
  const box = (l, t, r, b) => ({ left: l, top: t, right: r, bottom: b });

  const STEP_FREE = {
    osmId: 1, type: 'main', center: { lat: 52.5209, lng: 13.3965 },
    tags: { name: 'Nord', wheelchair: 'yes' }
  };
  const PLAIN = {
    osmId: 2, type: 'yes', center: { lat: 52.5208, lng: 13.3970 }, tags: { name: 'Ost' }
  };

  afterEach(() => labelBoxes.clear());

  function open(mode, boxes) {
    labelBoxes.set(boxes || { Nord: box(0, 0, 40, 16), Ost: box(100, 0, 140, 16) });
    return openPicker({ entrances: [STEP_FREE, PLAIN], mode: mode });
  }

  test('a marked door carries its glyph in the label; an unmarked one does not', () => {
    const { map } = open('foot');
    const html = labels(map).map((m) => m.options.icon.options.html);
    expect(html[0]).toContain('osrm-entrance-mark-wheelchair');
    expect(html[1]).not.toContain('osrm-entrance-mark');
  });

  test('the mark is hidden from assistive tech, which reads it off the dot instead', () => {
    const { map } = open('foot');
    expect(labels(map)[0].options.icon.options.html).toContain('aria-hidden="true"');
    expect(dots(map)[0].options.alt).toBe('Nord (Wheelchair accessible)');
    expect(dots(map)[1].options.alt).toBe('Ost');
  });

  test('a mode with no mark for that door marks nothing', () => {
    const { map } = open('driving');
    expect(labels(map)[0].options.icon.options.html).not.toContain('osrm-entrance-mark');
    expect(dots(map)[0].options.alt).toBe('Nord');
  });

  test('a merged label marks only the doors that earned it', () => {
    const { map } = open('foot', { Nord: box(0, 0, 40, 16), Ost: box(20, 0, 60, 16) });
    expect(labelTexts(map)).toEqual(['NordOst']);
    const html = labels(map)[0].options.icon.options.html;
    expect(html.match(/osrm-entrance-mark-wheelchair/g)).toHaveLength(1);
  });

  test('the mark label goes through the translator', () => {
    labelBoxes.set({ Nord: box(0, 0, 40, 16) });
    const { map } = openPicker({ entrances: [STEP_FREE], mode: 'foot' },
      { translate: (key) => ({ 'Wheelchair accessible': 'Barrierefrei' })[key] || key });
    expect(dots(map)[0].options.alt).toBe('Nord (Barrierefrei)');
  });
});

describe('re-showing without moving the view', () => {
  test('frame: false redraws the offer where it is', () => {
    const { map, picker } = openPicker();
    settle();
    expect(map.fitBounds).toHaveBeenCalledTimes(1);

    picker.show({ waypointIndex: 1, placeCenter: CENTRE, entrances: [MAIN], frame: false });
    map.fire('moveend');
    settle();
    expect(map.fitBounds).toHaveBeenCalledTimes(1);
    expect(dots(map)).toHaveLength(1);
  });
});

describe('one offer per waypoint', () => {
  const OTHER = { osmId: 7, type: 'main', center: { lat: 52.4, lng: 13.5 } };

  // Two waypoints showing their doors at once. openPicker builds the first.
  function openTwo() {
    const opened = openPicker();
    opened.picker.show({
      waypointIndex: 3, placeName: 'BER', placeCenter: { lat: 52.36, lng: 13.5 },
      entrances: [OTHER]
    });
    return opened;
  }

  test('naming a second place does not withdraw the first place\'s doors', () => {
    const { map, picker } = openTwo();
    expect(dots(map)).toHaveLength(3);
    expect(picker.isOpenFor(1)).toBe(true);
    expect(picker.isOpenFor(3)).toBe(true);
  });

  test('the view follows the newest offer', () => {
    const { map, picker } = openTwo();
    expect(picker.getWaypointIndex()).toBe(3);
    settle();
    expect(map.fitBounds.mock.calls.pop()[0]._points).toContain(OTHER.center);
  });

  test('each offer keeps its own selection', () => {
    const { map, picker, onSelect } = openTwo();
    dots(map)[0].fire('click');
    dots(map)[2].fire('click');
    expect(picker.getSelectedId(1)).toBe('osm:1');
    expect(picker.getSelectedId(3)).toBe('osm:7');
    expect(onSelect.mock.calls.map((c) => c[0].waypointIndex)).toEqual([1, 3]);
  });

  test('re-showing a waypoint replaces its offer in place, leaving the other alone', () => {
    const { map, picker } = openTwo();
    picker.show({ waypointIndex: 1, placeCenter: CENTRE, entrances: [MAIN], frame: false });
    expect(dots(map)).toHaveLength(2);
    expect(picker.isOpenFor(3)).toBe(true);
  });

  test('withdrawing one offer leaves the others on the map', () => {
    const { map, picker } = openTwo();
    picker.hideWaypoint(1);
    expect(picker.isOpenFor(1)).toBe(false);
    expect(picker.isOpenFor(3)).toBe(true);
    expect(dots(map)).toHaveLength(1);
    expect(picker.isOpen()).toBe(true);
  });

  test('withdrawing the framed offer hands the view to a surviving one', () => {
    const { picker } = openTwo();
    expect(picker.getWaypointIndex()).toBe(3);
    picker.hideWaypoint(3);
    expect(picker.getWaypointIndex()).toBe(1);
  });

  test('withdrawing the last offer closes the picker altogether', () => {
    const { map, picker } = openTwo();
    picker.hideWaypoint(1);
    picker.hideWaypoint(3);
    expect(picker.isOpen()).toBe(false);
    expect(map.hasLayer(pickerGroup(map))).toBe(false);
  });

  test('withdrawing a waypoint with no offer is harmless', () => {
    const { picker } = openTwo();
    picker.hideWaypoint(9);
    expect(picker.isOpen()).toBe(true);
  });

  test('a click on a door whose offer was replaced does nothing', () => {
    const { map, picker, onSelect } = openPicker();
    const stale = dots(map)[0];
    picker.show({ waypointIndex: 1, placeCenter: CENTRE, entrances: [SIDE], frame: false });
    stale.fire('click');
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe('offers follow a splice of the waypoint list', () => {
  const OTHER = { osmId: 7, type: 'main', center: { lat: 52.4, lng: 13.5 } };

  function openAt(indexes) {
    const map = makeMap();
    const picker = entrancePicker.createEntrancePicker(map, {});
    indexes.forEach((i) => picker.show({
      waypointIndex: i, placeCenter: CENTRE, entrances: [MAIN, OTHER], frame: false
    }));
    return { map, picker };
  }

  test('an insert before an offer renumbers it', () => {
    const { picker } = openAt([2]);
    picker.spliceOffers(0, 0, 1);
    expect(picker.isOpenFor(3)).toBe(true);
    expect(picker.isOpenFor(2)).toBe(false);
  });

  test('an offer before the splice is left where it is', () => {
    const { picker } = openAt([0, 3]);
    picker.spliceOffers(2, 0, 1);
    expect(picker.isOpenFor(0)).toBe(true);
    expect(picker.isOpenFor(4)).toBe(true);
  });

  test('removing a waypoint takes its offer and pulls the later ones back', () => {
    const { picker } = openAt([1, 3]);
    picker.spliceOffers(1, 1, 0);
    expect(picker.isOpenFor(1)).toBe(false);
    expect(picker.isOpenFor(2)).toBe(true);
  });

  test('the framed offer moves with its waypoint', () => {
    const { picker } = openAt([2]);
    picker.spliceOffers(0, 0, 2);
    expect(picker.getWaypointIndex()).toBe(4);
  });

  test('removing the framed offer hands the view to a survivor', () => {
    const { picker } = openAt([0, 2]);
    expect(picker.getWaypointIndex()).toBe(2);
    picker.spliceOffers(2, 1, 0);
    expect(picker.getWaypointIndex()).toBe(0);
  });

  test('removing every offer closes the picker', () => {
    const { map, picker } = openAt([0, 1]);
    picker.spliceOffers(0, 2, 0);
    expect(picker.isOpen()).toBe(false);
    expect(map.hasLayer(pickerGroup(map))).toBe(false);
  });

  test('a splice that changes nothing leaves the offers untouched', () => {
    const { picker } = openAt([0, 1]);
    picker.spliceOffers(5, 0, 0);
    expect(picker.isOpenFor(0)).toBe(true);
    expect(picker.isOpenFor(1)).toBe(true);
  });
});

describe('choosing what to frame', () => {
  // A bbox big enough that the doors stay far apart inside it.
  const ROOMY = makeBounds([{ lat: 52.5205, lng: 13.3960 }, { lat: 52.5212, lng: 13.3980 }]);
  // The BER case: a 5 km site whose five doors sit metres apart.
  const HUGE = makeBounds([{ lat: 52.30, lng: 13.45 }, { lat: 52.40, lng: 13.55 }]);

  test('the place bbox is framed when it leaves the doors far enough apart', () => {
    // At this zoom the two doors project ~45 px apart: aimable, so the site
    // itself is what gets framed.
    const { map } = openPicker({ placeBounds: ROOMY }, null, { boundsZoom: 5 });
    settle();
    expect(map.fitBounds.mock.calls[0][0]).toBe(ROOMY);
  });

  // Framing a 5 km airport puts its doors about 3 px apart: a cluster nobody
  // can aim at. The doors win and the site runs off the edges.
  test('the doors are framed instead when the bbox would bunch them up', () => {
    const { map } = openPicker({ placeBounds: HUGE }, null, { boundsZoom: 0.0001 });
    settle();
    const framed = map.fitBounds.mock.calls[0][0];
    expect(framed).not.toBe(HUGE);
    expect(framed._points).toEqual([MAIN.center, SIDE.center]);
  });

  test('a single door leaves nothing to bunch up, so the bbox is kept', () => {
    const { map } = openPicker({ placeBounds: HUGE, entrances: [MAIN] }, null,
      { boundsZoom: 0.0001 });
    settle();
    expect(map.fitBounds.mock.calls[0][0]).toBe(HUGE);
  });

  test('a bbox the geocoder did not give falls back to the doors', () => {
    const { map } = openPicker({ placeBounds: makeBounds([]) });
    settle();
    expect(map.fitBounds.mock.calls[0][0]._points).toEqual([MAIN.center, SIDE.center]);
  });

  // Already framed and legible: moving the map would be disruption for its own
  // sake.
  // Centred between the two doors, so what is left to decide is size alone.
  const BETWEEN_DOORS = { lat: 52.5208403, lng: 13.3969802 };

  test('a place already filling the view is left alone', () => {
    // The doors span ~576 px here, half the free viewport, and sit clear of
    // both the edges and the pane: moving the map would be disruption for its
    // own sake.
    const { map } = openPicker(null, null,
      { center: BETWEEN_DOORS, pixelsPerDegree: 630000 });
    settle();
    expect(map.fitBounds).not.toHaveBeenCalled();
  });

  test('a place too small to read is framed even when it is in the clear', () => {
    // The same doors, now ~9 px apart.
    const { map } = openPicker(null, null,
      { center: BETWEEN_DOORS, pixelsPerDegree: 10000 });
    settle();
    expect(map.fitBounds).toHaveBeenCalled();
  });

  test('a place hidden behind the directions pane is always re-framed', () => {
    // Big enough to be legible, but the pane covers where it sits.
    const { map } = openPicker(null, { paneWidth: () => 1100 },
      { center: BETWEEN_DOORS, pixelsPerDegree: 630000 });
    settle();
    expect(map.fitBounds).toHaveBeenCalled();
  });
});

describe('the site outline', () => {
  const GEOMETRY = { type: 'Polygon', coordinates: [[[13.395, 52.52], [13.397, 52.52], [13.396, 52.521]]] };

  function openWithOutline(resolve, showOpts) {
    let settleOutline;
    const fetchOutline = jest.fn(() => new Promise((r) => { settleOutline = r; }));
    const opened = openPicker(Object.assign({ place: { osmId: 1 } }, showOpts), { fetchOutline });
    return Object.assign({ fetchOutline, resolveOutline: (g) => { settleOutline(g); return Promise.resolve(); } }, opened);
  }

  test('is fetched for the place and drawn behind the doors', async () => {
    const { map, fetchOutline, resolveOutline } = openWithOutline();
    expect(fetchOutline).toHaveBeenCalledWith({ osmId: 1 });
    expect(outlines(map)).toHaveLength(0);

    await resolveOutline(GEOMETRY);
    expect(outlines(map)).toHaveLength(1);
    expect(outlines(map)[0].geometry).toBe(GEOMETRY);
    // Context, not a target: never in the way of a click on a door.
    expect(outlines(map)[0].options.style.interactive).toBe(false);
  });

  test('a place with no outline simply has none', async () => {
    const { map, resolveOutline } = openWithOutline();
    await resolveOutline(null);
    expect(outlines(map)).toHaveLength(0);
    expect(dots(map)).toHaveLength(2);
  });

  test('the picker works without a fetcher at all', () => {
    const { map } = openPicker();
    expect(dots(map)).toHaveLength(2);
    expect(outlines(map)).toHaveLength(0);
  });

  test('nothing is fetched for a show that carries no place', () => {
    const fetchOutline = jest.fn();
    openPicker(null, { fetchOutline });
    expect(fetchOutline).not.toHaveBeenCalled();
  });

  // The offer may be gone by the time the request lands.
  test('an outline arriving after its offer was withdrawn is dropped', async () => {
    const { map, picker, resolveOutline } = openWithOutline();
    picker.hide();
    await resolveOutline(GEOMETRY);
    expect(outlines(map)).toHaveLength(0);
  });

  test('an outline arriving after its offer was replaced is dropped', async () => {
    const { map, picker, resolveOutline } = openWithOutline();
    picker.show({ waypointIndex: 1, placeCenter: CENTRE, entrances: [MAIN], frame: false });
    await resolveOutline(GEOMETRY);
    expect(outlines(map)).toHaveLength(0);
  });

  // But another waypoint being shown meanwhile must not cancel this one.
  test('showing another waypoint does not cancel an outline in flight', async () => {
    const { map, picker, resolveOutline } = openWithOutline();
    picker.show({ waypointIndex: 5, placeCenter: CENTRE, entrances: [SIDE], frame: false });
    await resolveOutline(GEOMETRY);
    expect(outlines(map)).toHaveLength(1);
  });

  test('each offer keeps its own outline, and closing clears them', async () => {
    const { map, picker, resolveOutline } = openWithOutline();
    await resolveOutline(GEOMETRY);
    expect(outlines(map)).toHaveLength(1);
    picker.hide();
    expect(outlines(map)).toHaveLength(0);
  });
});
