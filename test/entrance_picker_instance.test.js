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
  return { _kind: 'bounds', _points: points, isValid: () => points.length > 0 };
}

jest.mock('leaflet', () => ({
  layerGroup: (children) => mockMakeLayerGroup(children),
  latLngBounds: (points) => mockMakeBounds(points),
  point: (x, y) => ({ x, y }),
  divIcon: (opts) => ({ _kind: 'divIcon', options: opts }),
  polyline: (points, style) => ({ _kind: 'polyline', points, style }),
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

function makeMap() {
  return {
    _layers: [],
    _handlers: {},
    _panes: {},
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

function openPicker(showOpts, options) {
  const map = makeMap();
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
  return map._layers.filter((l) => l._kind === 'layerGroup' && l._layers.length === 3)[0];
}

function links(map) {
  const g = pickerGroup(map);
  return g ? g._layers[0]._layers : [];
}

function labels(map) {
  const g = pickerGroup(map);
  return g ? g._layers[1]._layers : [];
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
  return g ? g._layers[2]._layers : [];
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
  test('brings the doors into view, and the pin with them', () => {
    const { map } = openPicker();
    settle();
    expect(map.fitBounds).toHaveBeenCalledTimes(1);
    expect(map.fitBounds.mock.calls[0][0]._points)
      .toEqual([MAIN.center, SIDE.center, CENTRE]);
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
