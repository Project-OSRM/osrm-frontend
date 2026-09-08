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
    on(evt, fn) { this.handlers[evt] = fn; return this; },
    fire(evt, e) { this.handlers[evt] && this.handlers[evt](e || {}); }
  })
}));

const entrancePicker = require('../src/entrance_picker');

function makeMap() {
  return {
    _layers: [],
    _handlers: {},
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
  return map._layers.filter((l) => l._kind === 'layerGroup' && l._layers.length === 2)[0];
}

function links(map) {
  const g = pickerGroup(map);
  return g ? g._layers[0]._layers : [];
}

function dots(map) {
  const g = pickerGroup(map);
  return g ? g._layers[1]._layers : [];
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
