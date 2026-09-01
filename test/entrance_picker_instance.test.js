/**
 * @jest-environment jsdom
 */
'use strict';

/**
 * Behaviour of the live picker — the half that talks to Leaflet: which dots get
 * drawn, what a click does, when the view is re-framed, and how the site outline
 * is loaded. The pure helpers are covered in entrance_picker.test.js.
 *
 * Leaflet is faked rather than loaded: the real thing needs a DOM, and what
 * matters here is the sequence of calls the picker makes, not Leaflet's own
 * rendering.
 */

// --- Leaflet fake -----------------------------------------------------------

function mockMakeLayerGroup(children) {
  return {
    _kind: 'layerGroup',
    _layers: (children || []).slice(),
    _added: [],
    addLayer(l) { this._layers.push(l); this._added.push(l); return this; },
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

// Where each label's box lands, keyed by its text. Set by a test before the
// layout pass runs; an absent entry means "not measurable yet".
const mockLabelBoxes = {};

jest.mock('leaflet', () => ({
  layerGroup: (children) => mockMakeLayerGroup(children),
  latLngBounds: (points) => mockMakeBounds(points),
  point: (x, y) => ({ x, y }),
  divIcon: (opts) => ({ _kind: 'divIcon', options: opts }),
  geoJSON: (geometry, opts) => ({ _kind: 'geoJSON', geometry, options: opts }),
  polyline: (points, style) => ({ _kind: 'polyline', points, style }),
  DomEvent: { stopPropagation: jest.fn() },
  marker: (latLng, opts) => ({
    _kind: 'marker',
    latLng,
    options: opts,
    handlers: {},
    getLatLng() { return this.latLng; },
    // Mimics enough of the label element for the layout pass to measure it.
    getElement() {
      const html = (this.options.icon && this.options.icon.options.html) || '';
      const text = html.replace(/<[^>]*>/g, '');
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

// --- Map fake ---------------------------------------------------------------

// Projects around a centre so container points land inside the viewport, as
// they would on a real map. At pixelsPerDegree = 10000, 0.001° is 10 px.
function makeMap(overrides) {
  const o = Object.assign({
    size: { x: 1200, y: 800 },
    pixelsPerDegree: 10000,
    center: { lat: 52.5209336, lng: 13.3956302 }
  }, overrides);
  return {
    _layers: [],
    _handlers: {},
    fitBounds: jest.fn(),
    getSize: () => o.size,
    hasLayer(l) { return this._layers.indexOf(l) !== -1; },
    removeLayer(l) { this._layers = this._layers.filter((x) => x !== l); },
    latLngToContainerPoint: (ll) => ({
      x: (ll.lng - o.center.lng) * o.pixelsPerDegree + o.size.x / 2,
      y: (o.center.lat - ll.lat) * o.pixelsPerDegree + o.size.y / 2
    }),
    project: (ll, zoom) => ({
      x: ll.lng * o.pixelsPerDegree * (zoom || 1),
      y: -ll.lat * o.pixelsPerDegree * (zoom || 1)
    }),
    getBoundsZoom: jest.fn(() => o.boundsZoom !== undefined ? o.boundsZoom : 1),
    _panes: {},
    getPane(name) { return this._panes[name]; },
    createPane(name) { this._panes[name] = { style: {} }; return this._panes[name]; },
    on(evt, fn) { (this._handlers[evt] = this._handlers[evt] || []).push(fn); },
    off(evt, fn) {
      this._handlers[evt] = (this._handlers[evt] || []).filter((f) => f !== fn);
    },
    fire(evt) { (this._handlers[evt] || []).slice().forEach((f) => f()); }
  };
}

const CENTRE = { lat: 52.5209336, lng: 13.3956302 };
const MAIN = { osmId: 1, type: 'main', center: { lat: 52.5209566, lng: 13.3965227 } };
const SIDE = { osmId: 2, type: 'yes', center: { lat: 52.5207240, lng: 13.3974377 } };

function openPicker(extra, showOpts) {
  const map = makeMap(extra && extra.map);
  const onSelect = jest.fn();
  const picker = entrancePicker.createEntrancePicker(
    map, Object.assign({ onSelect }, extra && extra.options));
  const opened = picker.show(Object.assign({
    waypointIndex: 1,
    placeName: 'Pergamonmuseum',
    placeCenter: CENTRE,
    entrances: [MAIN, SIDE]
  }, showOpts));
  return { map, picker, onSelect, opened };
}

// The picker's own layer group holds [outlineLayer, markerLayer], in that order.
function pickerGroup(map) {
  return map._layers[0];
}

function outlineLayer(map) {
  const g = pickerGroup(map);
  return g ? g._layers[0] : null;
}

// The picker's group holds [outlineLayer, linkLayer, labelLayer, markerLayer].
function linkLayerOf(map) {
  const g = pickerGroup(map);
  return g ? g._layers[1] : null;
}

// The label markers currently drawn.
function labels(map) {
  const g = pickerGroup(map);
  return g ? g._layers[2]._layers : [];
}

// The text of each drawn label, in order.
function labelTexts(map) {
  return labels(map).map((m) => m.options.icon.options.html.replace(/<[^>]*>/g, ''));
}

// The dots currently drawn, latest render only.
function dots(map) {
  const g = pickerGroup(map);
  return g ? g._layers[3]._layers : [];
}

function classesOf(map) {
  return dots(map).map((m) => m.options.icon.options.className);
}

// The dashed links from a chosen door back to the pin.
function links(map) {
  const l = linkLayerOf(map);
  return l ? l._layers.filter((x) => x._kind === 'polyline') : [];
}

function kindsOf(map) {
  return kindsOfClasses(classesOf(map));
}

function kindsOfClasses(classes) {
  return classes.map((c) => c.replace('osrm-entrance-marker osrm-entrance-marker-', ''));
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

describe('show', () => {
  test('adds its layer to the map and reports that it opened', () => {
    const { map, picker, opened } = openPicker();
    expect(opened).toBe(true);
    expect(picker.isOpen()).toBe(true);
    expect(map._layers).toHaveLength(1);
  });

  test('draws every door, none chosen yet', () => {
    const { map } = openPicker();
    expect(kindsOf(map)).toEqual(['main', 'other']);
  });

  test('opens for a place with a single door', () => {
    const map = makeMap();
    const picker = entrancePicker.createEntrancePicker(map, {});
    expect(picker.show({ waypointIndex: 1, placeCenter: CENTRE, entrances: [MAIN] })).toBe(true);
    expect(dots(map)).toHaveLength(1);
  });

  test('refuses to open when the place has no doors at all', () => {
    const map = makeMap();
    const picker = entrancePicker.createEntrancePicker(map, {});
    expect(picker.show({ waypointIndex: 1, placeCenter: CENTRE, entrances: [] })).toBe(false);
    expect(picker.isOpen()).toBe(false);
    expect(map._layers).toHaveLength(0);
  });

  test('remembers which waypoint it belongs to, with nothing chosen', () => {
    const { picker } = openPicker(null, { waypointIndex: 3 });
    expect(picker.getWaypointIndex()).toBe(3);
    expect(picker.getSelectedId()).toBeNull();
  });

  test('draws no link back to the pin until a door is chosen', () => {
    const { map } = openPicker();
    expect(links(map)).toHaveLength(0);
  });

  test('labels each dot through the supplied translator', () => {
    const translate = jest.fn((k) => 'T:' + k);
    const { map } = openPicker({ options: { translate } });
    expect(labelTexts(map)).toEqual(['T:Main entrance', 'T:Entrance']);
    expect(translate).toHaveBeenCalledWith('Main entrance');
  });

  test('falls back to the raw key when no translator is given', () => {
    const map = makeMap();
    const picker = entrancePicker.createEntrancePicker(map, {});
    picker.show({ waypointIndex: 1, placeCenter: CENTRE, entrances: [MAIN, SIDE] });
    expect(labelTexts(map)).toEqual(['Main entrance', 'Entrance']);
  });

  test('an exit-only door is labelled an exit, not an entrance', () => {
    const exit = { osmId: 8, type: 'exit', center: { lat: 52.5206, lng: 13.398 } };
    const { map } = openPicker(null, { entrances: [MAIN, exit] });
    expect(labelTexts(map)).toEqual(['Main entrance', 'Exit']);
  });

  test('a door that names itself is labelled with that name', () => {
    const named = {
      osmId: 7, type: 'yes', center: { lat: 52.521, lng: 13.413 },
      tags: { name: 'Eingang Ravelinplatz' }
    };
    const translate = jest.fn((k) => 'T:' + k);
    const { map } = openPicker({ options: { translate } }, { entrances: [MAIN, named] });
    expect(labelTexts(map)).toEqual(['T:Main entrance', 'Eingang Ravelinplatz']);
    // A name from OSM is not run through the translator.
    expect(translate).not.toHaveBeenCalledWith('Eingang Ravelinplatz');
  });
});

describe('selecting a dot', () => {
  test('routes to the door while reporting where the pin belongs', () => {
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

  test('stops the click reaching the map, which would drop a new waypoint', () => {
    const L = require('leaflet');
    L.DomEvent.stopPropagation.mockClear();
    const { map } = openPicker();
    dots(map)[0].fire('click', { fake: 'event' });
    expect(L.DomEvent.stopPropagation).toHaveBeenCalledWith({ fake: 'event' });
  });

  test('keeps every door on the map and marks the chosen one', () => {
    const { map, picker } = openPicker();
    dots(map)[0].fire('click');
    expect(picker.getSelectedId()).toBe('osm:1');
    expect(dots(map)).toHaveLength(2);
    expect(classesOf(map)[0]).toContain('osrm-entrance-marker-selected');
    expect(classesOf(map)[1]).not.toContain('osrm-entrance-marker-selected');
  });

  test('draws a dashed link from the chosen door to the pin', () => {
    const { map } = openPicker();
    dots(map)[0].fire('click');
    const drawn = links(map);
    expect(drawn).toHaveLength(1);
    expect(drawn[0].points).toEqual([MAIN.center, CENTRE]);
    expect(drawn[0].style.dashArray).toBeTruthy();
  });

  test('the link moves with the choice', () => {
    const { map } = openPicker();
    dots(map)[0].fire('click');
    dots(map)[1].fire('click');
    expect(links(map)[0].points).toEqual([SIDE.center, CENTRE]);
  });

  test('clicking the chosen door again releases it, routing back to the place', () => {
    const { map, picker, onSelect } = openPicker();
    dots(map)[0].fire('click');
    onSelect.mockClear();
    dots(map)[0].fire('click');
    expect(picker.getSelectedId()).toBeNull();
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({
      latLng: CENTRE, markerLatLng: CENTRE, entrance: null
    }));
    expect(links(map)).toHaveLength(0);
  });

  test('a click after hide does nothing', () => {
    const { map, picker, onSelect } = openPicker();
    const dot = dots(map)[0];
    picker.hide();
    dot.fire('click');
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe('hide', () => {
  test('drops the layer from the map and closes', () => {
    const { map, picker } = openPicker();
    picker.hide();
    expect(picker.isOpen()).toBe(false);
    expect(picker.getSelectedId()).toBeNull();
    expect(picker.getWaypointIndex()).toBeNull();
    expect(map._layers).toHaveLength(0);
  });

  test('is safe to call when already closed', () => {
    const map = makeMap();
    const picker = entrancePicker.createEntrancePicker(map, {});
    expect(() => picker.hide()).not.toThrow();
  });

  test('Escape closes the picker', () => {
    const { picker } = openPicker();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(picker.isOpen()).toBe(false);
  });

  test('other keys leave it open', () => {
    const { picker } = openPicker();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    expect(picker.isOpen()).toBe(true);
  });

  test('the Escape handler is removed, so a later key cannot reach a closed picker', () => {
    const { picker } = openPicker();
    picker.hide();
    expect(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
      .not.toThrow();
    expect(picker.isOpen()).toBe(false);
  });
});

describe('site outline', () => {
  const GEOMETRY = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] };

  // Whether an outline path has actually been drawn.
  function hasOutline(map) {
    const l = outlineLayer(map);
    return !!(l && l._layers.some((x) => x._kind === 'geoJSON'));
  }

  test('is fetched for the place and drawn beneath the dots', async () => {
    const fetchOutline = jest.fn(() => Promise.resolve(GEOMETRY));
    const place = { osmType: 'way', osmId: 313659704 };
    const { map } = openPicker({ options: { fetchOutline } }, { place });
    expect(fetchOutline).toHaveBeenCalledWith(place);
    await Promise.resolve();
    expect(hasOutline(map)).toBe(true);
  });

  test('a place with no outline simply gets none', async () => {
    const fetchOutline = jest.fn(() => Promise.resolve(null));
    const { map } = openPicker({ options: { fetchOutline } }, { place: {} });
    await Promise.resolve();
    expect(hasOutline(map)).toBe(false);
  });

  test('is not requested when the result carries no place', () => {
    const fetchOutline = jest.fn();
    openPicker({ options: { fetchOutline } });
    expect(fetchOutline).not.toHaveBeenCalled();
  });

  test('an outline that arrives after the picker closed is discarded', async () => {
    let resolve;
    const fetchOutline = jest.fn(() => new Promise((r) => { resolve = r; }));
    const { map, picker } = openPicker({ options: { fetchOutline } }, { place: {} });
    picker.hide();
    resolve(GEOMETRY);
    await Promise.resolve();
    expect(map._layers).toHaveLength(0);
  });

  test('an outline for a place the user has moved on from is discarded', async () => {
    const pending = [];
    const fetchOutline = jest.fn(() => new Promise((r) => pending.push(r)));
    const { map, picker } = openPicker({ options: { fetchOutline } }, { place: { osmId: 1 } });
    // A second place is picked before the first outline lands.
    picker.show({ waypointIndex: 1, placeCenter: CENTRE, entrances: [MAIN, SIDE], place: { osmId: 2 } });
    pending[0](GEOMETRY);
    await Promise.resolve();
    expect(hasOutline(map)).toBe(false);
    pending[1](GEOMETRY);
    await Promise.resolve();
    expect(hasOutline(map)).toBe(true);
  });
});

describe('framing the view', () => {
  // The picker waits for the map to settle before re-framing, so every
  // assertion here runs the timers first.
  function settle(map) {
    jest.advanceTimersByTime(500);
    return map.fitBounds.mock.calls[map.fitBounds.mock.calls.length - 1];
  }

  test('re-frames once the map settles, not immediately', () => {
    const { map } = openPicker(null, { placeBounds: makeBounds([CENTRE, MAIN.center]) });
    expect(map.fitBounds).not.toHaveBeenCalled();
    settle(map);
    expect(map.fitBounds).toHaveBeenCalledTimes(1);
  });

  test('a moveend re-frames without waiting for the backstop timer', () => {
    const { map } = openPicker(null, { placeBounds: makeBounds([CENTRE, MAIN.center]) });
    map.fire('moveend');
    expect(map.fitBounds).toHaveBeenCalledTimes(1);
    // The timer must not fire a second time afterwards.
    jest.advanceTimersByTime(500);
    expect(map.fitBounds).toHaveBeenCalledTimes(1);
  });

  test('keeps the framed extent clear of the directions pane', () => {
    const paneWidth = () => 400;
    const { map } = openPicker(
      { options: { paneWidth } },
      { placeBounds: makeBounds([CENTRE, MAIN.center]) });
    const call = settle(map);
    expect(call[1].paddingBottomRight).toEqual({ x: 424, y: 24 });
    expect(call[1].paddingTopLeft).toEqual({ x: 24, y: 24 });
  });

  // Small enough that the framing is still worth doing — an area already filling
  // the viewport is left alone regardless of which bounds were chosen.
  const AREA = () => makeBounds([{ lat: 52.518, lng: 13.392 }, { lat: 52.524, lng: 13.400 }]);

  test('frames the place bbox when it leaves the doors far enough apart', () => {
    const area = AREA();
    // At this zoom the two doors project ~450 px apart, well clear of the
    // minimum separation, so the site wins.
    const { map } = openPicker({ map: { boundsZoom: 50 } }, { placeBounds: area });
    expect(settle(map)[0]).toBe(area);
  });

  test('frames the doors instead when the bbox would bunch them up', () => {
    const area = AREA();
    // A tiny zoom projects the two doors within a pixel of each other.
    const { map } = openPicker({ map: { boundsZoom: 0.01 } }, { placeBounds: area });
    const call = settle(map);
    expect(call[0]).not.toBe(area);
    expect(call[0]._points).toEqual([MAIN.center, SIDE.center]);
  });

  test('the separation is judged at the zoom the bbox would actually produce', () => {
    const area = AREA();
    const { map } = openPicker({ map: { boundsZoom: 50 } }, { placeBounds: area });
    settle(map);
    // The pane width is part of that calculation, so it is passed through.
    expect(map.getBoundsZoom).toHaveBeenCalledWith(area, false, { x: 48, y: 48 });
  });

  test('falls back to the dots when the place has no bbox at all', () => {
    const { map } = openPicker();
    const call = settle(map);
    expect(call[0]._points).toEqual([MAIN.center, SIDE.center]);
  });

  test('a single door falls back to door-and-centre so both stay in view', () => {
    const map = makeMap();
    const picker = entrancePicker.createEntrancePicker(map, {});
    picker.show({ waypointIndex: 1, placeCenter: CENTRE, entrances: [MAIN] });
    jest.advanceTimersByTime(500);
    expect(map.fitBounds.mock.calls[0][0]._points).toEqual([MAIN.center, CENTRE]);
  });

  test('leaves the view alone when the extent already fills the free viewport', () => {
    // 0.06° apart is 600 px, over half the 1152 px of free viewport, and both
    // sit inside the map rather than off its edges.
    const wide = [
      { osmId: 1, type: 'main', center: { lat: 52.5209336, lng: 13.3656302 } },
      { osmId: 2, type: 'yes', center: { lat: 52.5209336, lng: 13.4256302 } }
    ];
    const map = makeMap();
    const picker = entrancePicker.createEntrancePicker(map, {});
    picker.show({ waypointIndex: 1, placeCenter: CENTRE, entrances: wide });
    jest.advanceTimersByTime(500);
    expect(map.fitBounds).not.toHaveBeenCalled();
  });

  test('does nothing once the picker has closed', () => {
    const { map, picker } = openPicker();
    picker.hide();
    jest.advanceTimersByTime(500);
    expect(map.fitBounds).not.toHaveBeenCalled();
  });

  test('focusView is a no-op on a closed picker rather than throwing', () => {
    const map = makeMap();
    const picker = entrancePicker.createEntrancePicker(map, {});
    expect(() => picker.focusView()).not.toThrow();
    jest.advanceTimersByTime(500);
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
    const map = makeMap();
    const picker = entrancePicker.createEntrancePicker(map, {});
    picker.show({
      waypointIndex: 1, placeCenter: CENTRE, entrances: entrances || NAMED
    });
    return { map, picker };
  }

  test('every door names itself when the labels all fit', () => {
    const { map } = openWith({
      Nord: box(0, 0, 40, 16), Ost: box(100, 0, 140, 16), Sued: box(200, 0, 240, 16)
    });
    expect(labelTexts(map)).toEqual(['Nord', 'Ost', 'Sued']);
  });

  test('a colliding run collapses into one label listing every door in it', () => {
    const { map } = openWith({
      Nord: box(0, 0, 40, 16), Ost: box(20, 0, 60, 16), Sued: box(200, 0, 240, 16)
    });
    // Two labels now: the merged run, and the one that still fits.
    expect(labelTexts(map)).toEqual(['NordOst', 'Sued']);
  });

  test('the merged label is marked as such, and anchored on the first door', () => {
    const { map } = openWith({
      Nord: box(0, 0, 40, 16), Ost: box(20, 0, 60, 16), Sued: box(200, 0, 240, 16)
    });
    const merged = labels(map)[0];
    expect(merged.options.icon.options.className).toContain('osrm-entrance-label-merged');
    expect(merged.latLng).toBe(NAMED[0].center);
    expect(labels(map)[1].options.icon.options.className)
      .not.toContain('osrm-entrance-label-merged');
  });

  test('everything colliding at once becomes a single label', () => {
    const { map } = openWith({
      Nord: box(0, 0, 40, 16), Ost: box(5, 0, 45, 16), Sued: box(10, 0, 50, 16)
    });
    expect(labelTexts(map)).toEqual(['NordOstSued']);
  });

  test('labels are drawn beneath the dots, in a pane of their own', () => {
    // A zIndexOffset cannot guarantee this: Leaflet derives a marker's z-index
    // from its latitude, so a label on a northerly door would outrank a dot on
    // a southerly one. The pane settles it for every marker at once.
    const { map } = openWith({
      Nord: box(0, 0, 40, 16), Ost: box(100, 0, 140, 16), Sued: box(200, 0, 240, 16)
    });
    const pane = labels(map)[0].options.pane;
    expect(pane).toBe('osrmEntranceLabels');
    expect(Number(map._panes[pane].style.zIndex)).toBeLessThan(600);
    // The dots stay in Leaflet's default marker pane.
    expect(dots(map).every((m) => m.options.pane === undefined)).toBe(true);
  });

  test('labels never take a click meant for a door', () => {
    const { map } = openWith({
      Nord: box(0, 0, 40, 16), Ost: box(100, 0, 140, 16), Sued: box(200, 0, 240, 16)
    });
    expect(labels(map).every((m) => m.options.interactive === false)).toBe(true);
  });

  test('the pane is made once and reused', () => {
    const { map, picker } = openWith({ Nord: box(0, 0, 40, 16) });
    const created = map.createPane.mock ? map.createPane.mock.calls.length : null;
    picker.layoutLabels();
    expect(map._panes.osrmEntranceLabels).toBeTruthy();
    expect(created === null || created <= 1).toBe(true);
  });

  test('names go in as text, so OSM cannot inject markup', () => {
    const nasty = '<img src=x onerror=alert(1)>';
    const { map } = openWith(
      { [nasty]: box(0, 0, 40, 16), Ost: box(20, 0, 60, 16) },
      [Object.assign({}, NAMED[0], { tags: { name: nasty } }), NAMED[1]]
    );
    const html = labels(map)[0].options.icon.options.html;
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  test('gives up rather than guessing when a label cannot be measured', () => {
    const { map, picker } = openWith({});
    expect(picker.layoutLabels()).toBeNull();
    // The per-door labels drawn for measuring are left in place.
    expect(labelTexts(map)).toEqual(['Nord', 'Ost', 'Sued']);
  });

  test('re-runs the layout when the map zooms', () => {
    const { map } = openWith({
      Nord: box(0, 0, 40, 16), Ost: box(20, 0, 60, 16), Sued: box(200, 0, 240, 16)
    });
    expect(labelTexts(map)).toEqual(['NordOst', 'Sued']);

    // Zoomed in far enough that they separate.
    labelBoxes.set({
      Nord: box(0, 0, 40, 16), Ost: box(100, 0, 140, 16), Sued: box(200, 0, 240, 16)
    });
    map.fire('zoomend');
    expect(labelTexts(map)).toEqual(['Nord', 'Ost', 'Sued']);
  });

  test('leaves no labels behind when it closes', () => {
    const { map, picker } = openWith({
      Nord: box(0, 0, 40, 16), Ost: box(100, 0, 140, 16), Sued: box(200, 0, 240, 16)
    });
    picker.hide();
    expect(labels(map)).toHaveLength(0);
  });

  test('stops re-laying out once closed', () => {
    const { map, picker } = openWith({ Nord: box(0, 0, 40, 16) });
    picker.hide();
    expect(() => map.fire('zoomend')).not.toThrow();
  });
});

describe('mode-dependent marks', () => {
  const labelBoxes = require('./__label_boxes');
  const box = (l, t, r, b) => ({ left: l, top: t, right: r, bottom: b });
  // A mark is part of the label's rendered text, so the harness — which keys
  // measured boxes by that text — sees it in the key too.
  const WC = '\u267F\uFE0F';
  const PK = '\uD83C\uDD7F\uFE0F';

  const STEP_FREE = { osmId: 1, type: 'main', center: { lat: 52.5209, lng: 13.3965 },
    tags: { name: 'Nord', wheelchair: 'yes' } };
  const STEPPED = { osmId: 2, type: 'yes', center: { lat: 52.5208, lng: 13.3970 },
    tags: { name: 'Ost', wheelchair: 'no' } };
  const UNKNOWN = { osmId: 3, type: 'yes', center: { lat: 52.5207, lng: 13.3975 },
    tags: { name: 'Sued' } };
  const GARAGE = { osmId: 4, type: 'yes', center: { lat: 52.5206, lng: 13.3980 },
    tags: { name: 'Tiefgarage', amenity: 'parking_entrance', parking: 'underground' } };

  afterEach(() => labelBoxes.clear());

  function open(entrances, boxes, mode) {
    labelBoxes.set(boxes);
    const map = makeMap();
    const picker = entrancePicker.createEntrancePicker(map, {});
    picker.show({ waypointIndex: 1, placeCenter: CENTRE, entrances: entrances, mode: mode });
    return { map, picker };
  }

  const html = (map) => labels(map).map((m) => m.options.icon.options.html);

  test('on foot, only the step-free door is marked', () => {
    const { map } = open([STEP_FREE, STEPPED, UNKNOWN], {
      ['Nord' + WC]: box(0, 0, 44, 16), Ost: box(100, 0, 140, 16), Sued: box(200, 0, 240, 16)
    }, 'foot');
    expect(html(map)[0]).toContain('osrm-entrance-mark-wheelchair');
    expect(html(map)[1]).not.toContain('osrm-entrance-mark');
    expect(html(map)[2]).not.toContain('osrm-entrance-mark');
  });

  test('when driving, the parking entrance is marked and the step-free door is not', () => {
    const { map } = open([STEP_FREE, GARAGE], {
      Nord: box(0, 0, 40, 16), ['Tiefgarage' + PK]: box(100, 0, 180, 16)
    }, 'car');
    expect(html(map)[0]).not.toContain('osrm-entrance-mark');
    expect(html(map)[1]).toContain('osrm-entrance-mark-parking');
  });

  test('cycling marks nothing', () => {
    const { map } = open([STEP_FREE, GARAGE], {
      Nord: box(0, 0, 40, 16), Tiefgarage: box(100, 0, 180, 16)
    }, 'bike');
    expect(html(map).join('')).not.toContain('osrm-entrance-mark');
  });

  test('changing mode re-marks the labels already on screen', () => {
    // refresh() re-shows an open picker when the profile changes, so the marks
    // have to follow rather than keep describing the mode the user has left.
    labelBoxes.set({
      ['Nord' + WC]: box(0, 0, 44, 16), Nord: box(0, 0, 40, 16),
      ['Tiefgarage' + PK]: box(100, 0, 180, 16), Tiefgarage: box(100, 0, 180, 16)
    });
    const map = makeMap();
    const picker = entrancePicker.createEntrancePicker(map, {});
    const show = (mode) => picker.show({
      waypointIndex: 1, placeCenter: CENTRE, entrances: [STEP_FREE, GARAGE], mode: mode
    });

    show('foot');
    expect(html(map)[0]).toContain('osrm-entrance-mark-wheelchair');
    expect(html(map)[1]).not.toContain('osrm-entrance-mark');

    show('car');
    expect(html(map)[0]).not.toContain('osrm-entrance-mark');
    expect(html(map)[1]).toContain('osrm-entrance-mark-parking');

    show('bike');
    expect(html(map).join('')).not.toContain('osrm-entrance-mark');
  });

  test('the mark is hidden from assistive tech, which reads the dot instead', () => {
    const { map } = open([STEP_FREE], { ['Nord' + WC]: box(0, 0, 44, 16) }, 'foot');
    expect(html(map)[0]).toContain('aria-hidden="true"');
    expect(dots(map)[0].options.alt).toBe('Nord (Wheelchair accessible)');
  });

  test('the driving alt text names the parking entrance', () => {
    const { map } = open([GARAGE], { ['Tiefgarage' + PK]: box(0, 0, 80, 16) }, 'car');
    expect(dots(map)[0].options.alt).toBe('Tiefgarage (Parking entrance)');
  });

  test('an unmarked door says only its name', () => {
    const { map } = open([UNKNOWN], { Sued: box(0, 0, 40, 16) }, 'foot');
    expect(dots(map)[0].options.alt).toBe('Sued');
  });

  test('a merged label marks only the doors that earned it', () => {
    // Nord and Ost collide and merge; the mark must stay on Nord's line alone.
    const { map } = open([STEP_FREE, STEPPED, UNKNOWN], {
      ['Nord' + WC]: box(0, 0, 44, 16), Ost: box(20, 0, 60, 16), Sued: box(200, 0, 240, 16)
    }, 'foot');
    const merged = html(map)[0];
    expect(merged.match(/osrm-entrance-mark/g)).toHaveLength(2);   // base class + modifier
    expect(labelTexts(map)[0]).toContain('Nord');
    expect(labelTexts(map)[0]).toContain('Ost');
  });

  test('the mark survives selecting the door it belongs to', () => {
    const { map } = open([STEP_FREE, STEPPED],
      { ['Nord' + WC]: box(0, 0, 44, 16), Ost: box(100, 0, 140, 16) }, 'foot');
    dots(map)[0].fire('click', {});
    expect(html(map)[0]).toContain('osrm-entrance-mark-wheelchair');
  });
});

describe('re-showing while already open', () => {
  // refresh() re-shows the picker when the travel mode changes, so show() runs
  // again on an open picker. Real Leaflet happens to ignore a repeat
  // registration of the same handler, but the picker detaches first rather than
  // depending on that — so this holds for any map object, including the fake
  // here, which does not de-duplicate.
  test('does not stack zoomend listeners', () => {
    const map = makeMap();
    const picker = entrancePicker.createEntrancePicker(map, {});
    const show = () => picker.show({
      waypointIndex: 1, placeCenter: CENTRE, entrances: [MAIN, SIDE]
    });

    show();
    const after1 = map._handlers.zoomend.length;
    show();
    show();

    expect(after1).toBe(1);
    expect(map._handlers.zoomend).toHaveLength(after1);
  });

  test('one hide still tears the picker down completely', () => {
    const map = makeMap();
    const picker = entrancePicker.createEntrancePicker(map, {});
    picker.show({ waypointIndex: 1, placeCenter: CENTRE, entrances: [MAIN, SIDE] });
    picker.show({ waypointIndex: 1, placeCenter: CENTRE, entrances: [MAIN, SIDE] });
    picker.hide();
    expect(picker.isOpen()).toBe(false);
    expect(map._handlers.zoomend).toHaveLength(0);
    expect(dots(map)).toHaveLength(0);
  });
});
