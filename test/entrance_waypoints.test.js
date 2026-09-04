'use strict';

/**
 * The wiring between a geocoding result and the routing plan: deciding whether
 * to offer the picker at all, what to offer, and what a chosen dot does to the
 * waypoint. This used to live inline in index.js, where none of it could be
 * reached without booting the whole app.
 */

jest.mock('leaflet', () => ({
  layerGroup: () => ({ addLayer() {}, clearLayers() {}, addTo() {} }),
  marker: () => ({ bindTooltip() { return this; }, on() { return this; } }),
  divIcon: () => ({}),
  latLngBounds: () => ({ isValid: () => false }),
  point: (x, y) => ({ x, y }),
  geoJSON: () => ({}),
  DomEvent: { stopPropagation() {} }
}));

const { createEntranceWaypoints, entranceWaypointName, waypointMarkerLatLng,
  createReverseNotifier } =
  require('../src/entrance_waypoints');

const MAIN = { osmId: 1, type: 'main', center: { lat: 52.5209566, lng: 13.3965227 } };
const SIDE = { osmId: 2, type: 'yes', center: { lat: 52.5207240, lng: 13.3974377 } };
const EXIT = { osmId: 3, type: 'exit', center: { lat: 52.5206, lng: 13.3980 } };
// entrance=entrance is one-way in: usable at a destination, never at an origin.
const WAY_IN = { osmId: 4, type: 'entrance', center: { lat: 52.5205, lng: 13.3985 } };
const CENTRE = { lat: 52.5209336, lng: 13.3956302 };

// A plan with the two internals the module reaches into, recorded so the tests
// can assert what LRM would have been told.
function makePlan(waypointCount) {
  const waypoints = [];
  const geocoderElems = [];
  for (let i = 0; i < (waypointCount || 2); i++) {
    waypoints.push({ latLng: null, name: '' });
    geocoderElems.push({ value: null, setValue(v) { this.value = v; } });
  }
  return {
    _waypoints: waypoints,
    _geocoderElems: geocoderElems,
    _updateMarkers: jest.fn(),
    _fireChanged: jest.fn()
  };
}

function makeTracker() {
  return { waypointDragStarted: jest.fn() };
}

// Stands in for the picker so the wiring can be observed directly.
function makeFakePicker() {
  const picker = {
    shown: [],
    hidden: 0,
    // Waypoint indices withdrawn one at a time, in order.
    hiddenWaypoints: [],
    // Which waypoints currently have an offer, as the real picker tracks.
    openFor: new Set(),
    open: false,
    onSelect: null,
    options: null,
    show: jest.fn(function(opts) {
      picker.shown.push(opts);
      picker.openFor.add(opts.waypointIndex);
      picker.open = true;
      return true;
    }),
    hide: jest.fn(function() {
      picker.hidden++;
      picker.openFor.clear();
      picker.open = false;
    }),
    hideWaypoint: jest.fn(function(waypointIndex) {
      picker.hiddenWaypoints.push(waypointIndex);
      picker.openFor.delete(waypointIndex);
      picker.open = picker.openFor.size > 0;
    }),
    // Mirrors the real picker: offers are renumbered by a splice, not dropped.
    spliceOffers: jest.fn(function(index, nRemoved, nAdded) {
      const delta = (nAdded || 0) - (nRemoved || 0);
      const next = new Set();
      picker.openFor.forEach((at) => {
        if (at < index) { next.add(at); return; }
        if (at < index + (nRemoved || 0)) return;
        next.add(at + delta);
      });
      picker.openFor = next;
      picker.open = picker.openFor.size > 0;
    }),
    isOpen: jest.fn(() => picker.open),
    isOpenFor: jest.fn((waypointIndex) => picker.openFor.has(waypointIndex)),
    focusView: jest.fn()
  };
  return picker;
}

function build(extra) {
  const plan = (extra && extra.plan) || makePlan();
  const routeFitTracker = makeTracker();
  const picker = makeFakePicker();
  const wiring = createEntranceWaypoints(Object.assign({
    map: { fake: 'map' },
    plan,
    routeFitTracker,
    createPicker: (map, opts) => {
      picker.map = map;
      picker.options = opts;
      picker.onSelect = opts.onSelect;
      return picker;
    }
  }, extra && extra.options));
  return { wiring, plan, routeFitTracker, picker };
}

function geocodeEvent(entrances, overrides) {
  return Object.assign({
    waypointIndex: 1,
    value: {
      name: 'Pergamonmuseum, 5, Am Kupfergraben, Berlin',
      center: CENTRE,
      bbox: { isValid: () => true },
      entrances
    }
  }, overrides);
}

describe('entranceWaypointName', () => {
  test('names each kind of door for what it is', () => {
    expect(entranceWaypointName('Museum', MAIN)).toBe('Museum (main entrance)');
    expect(entranceWaypointName('Museum', SIDE)).toBe('Museum (entrance)');
    // An exit is only ever offered at an origin; calling it an entrance there
    // would contradict why it is on offer.
    expect(entranceWaypointName('Museum', EXIT)).toBe('Museum (exit)');
  });

  test('uses the door\u2019s own name, so input and tooltip agree', () => {
    const named = { osmId: 7, type: 'yes', tags: { name: 'Eingang Ravelinplatz' } };
    expect(entranceWaypointName('Alexa', named)).toBe('Alexa (Eingang Ravelinplatz)');
  });

  test('a named door is not passed through the translator', () => {
    const named = { osmId: 7, type: 'main', tags: { name: 'Haupteingang Alexanderplatz' } };
    const de = jest.fn((k) => 'DE:' + k);
    expect(entranceWaypointName('Alexa', named, de)).toBe('Alexa (Haupteingang Alexanderplatz)');
    expect(de).not.toHaveBeenCalled();
  });

  test('leaves the name alone for the place centre', () => {
    expect(entranceWaypointName('Museum', null)).toBe('Museum');
  });

  test('runs the suffix through the translator', () => {
    const de = (k) => ({ 'main entrance': 'Haupteingang', entrance: 'Eingang' }[k] || k);
    expect(entranceWaypointName('Museum', MAIN, de)).toBe('Museum (Haupteingang)');
    expect(entranceWaypointName('Museum', SIDE, de)).toBe('Museum (Eingang)');
  });
});

describe('picker construction', () => {
  test('hands the picker its map and collaborators', () => {
    const fetchOutline = jest.fn();
    const paneWidth = jest.fn();
    const translate = jest.fn((k) => k);
    const { picker } = build({ options: { fetchOutline, paneWidth, translate } });
    expect(picker.map).toEqual({ fake: 'map' });
    expect(picker.options.fetchOutline).toBe(fetchOutline);
    expect(picker.options.paneWidth).toBe(paneWidth);
    expect(picker.options.translate).toBe(translate);
    expect(typeof picker.options.onSelect).toBe('function');
  });
});

describe('a geocoding result', () => {
  test('opens the picker with every usable door and the place centre', () => {
    const { wiring, picker } = build();
    expect(wiring.onGeocodeResult(geocodeEvent([MAIN, SIDE]))).toBe(true);
    expect(picker.shown).toHaveLength(1);
    expect(picker.shown[0]).toEqual(expect.objectContaining({
      waypointIndex: 1,
      placeName: 'Pergamonmuseum, 5, Am Kupfergraben, Berlin',
      placeCenter: CENTRE,
      entrances: [MAIN, SIDE]
    }));
  });

  test('leaves the waypoint alone — nothing is chosen for the user', () => {
    const { wiring, plan, picker } = build();
    wiring.onGeocodeResult(geocodeEvent([MAIN]));
    expect(picker.shown[0].selectedId).toBeUndefined();
    expect(plan._waypoints[1].latLng).toBeNull();
    expect(plan._fireChanged).not.toHaveBeenCalled();
  });

  test('passes the place through so its outline can be fetched', () => {
    const { wiring, picker } = build();
    const e = geocodeEvent([MAIN]);
    wiring.onGeocodeResult(e);
    expect(picker.shown[0].place).toBe(e.value);
    expect(picker.shown[0].placeBounds).toBe(e.value.bbox);
  });

  test('withdraws only that waypoint for a place with no entrances', () => {
    const { wiring, picker } = build();
    expect(wiring.onGeocodeResult(geocodeEvent(undefined))).toBe(false);
    expect(picker.hiddenWaypoints).toEqual([1]);
    expect(picker.hide).not.toHaveBeenCalled();
    expect(picker.show).not.toHaveBeenCalled();
  });

  test("a doorless start leaves the destination's doors alone", () => {
    // The reported bug: naming a start wiped the dots the destination was
    // already showing, because one shared offer served every waypoint.
    const plan = makePlan(2);
    const { wiring, picker } = build({ plan });
    wiring.onGeocodeResult(geocodeEvent([MAIN], { waypointIndex: 1 }));
    expect(picker.isOpenFor(1)).toBe(true);

    wiring.onGeocodeResult(geocodeEvent(undefined, { waypointIndex: 0 }));
    expect(picker.hiddenWaypoints).toEqual([0]);
    expect(picker.hide).not.toHaveBeenCalled();
    expect(picker.isOpenFor(1)).toBe(true);
  });

  test('two waypoints can offer their doors at the same time', () => {
    const plan = makePlan(2);
    const { wiring, picker } = build({ plan });
    wiring.onGeocodeResult(geocodeEvent([MAIN], { waypointIndex: 1 }));
    wiring.onGeocodeResult(geocodeEvent([MAIN], { waypointIndex: 0 }));
    expect(picker.isOpenFor(0)).toBe(true);
    expect(picker.isOpenFor(1)).toBe(true);
    expect(picker.hide).not.toHaveBeenCalled();
  });

  test('closes the picker when the result itself is missing', () => {
    const { wiring, picker } = build();
    expect(wiring.onGeocodeResult({ waypointIndex: 0, value: null })).toBe(false);
    expect(picker.hiddenWaypoints).toEqual([0]);
  });

  test('closes the picker when every entrance is unusable', () => {
    const service = { osmId: 9, type: 'service', center: { lat: 1, lng: 1 } };
    const { wiring, picker } = build();
    expect(wiring.onGeocodeResult(geocodeEvent([service]))).toBe(false);
    expect(picker.hiddenWaypoints).toEqual([1]);
  });

  // The direction a door has to work in comes from which end of the route the
  // waypoint is — see the OSM wiki's one-way entrance values.
  test('a destination is offered the entrance-only door but not the exit-only one', () => {
    const { wiring, picker } = build({ plan: makePlan(2) });
    const inOnly = { osmId: 4, type: 'entrance', center: { lat: 1, lng: 1 } };
    wiring.onGeocodeResult(geocodeEvent([MAIN, inOnly, EXIT], { waypointIndex: 1 }));
    expect(picker.shown[0].entrances).toEqual([MAIN, inOnly]);
  });

  test('an origin is offered the exit-only door but not the entrance-only one', () => {
    const { wiring, picker } = build({ plan: makePlan(2) });
    const inOnly = { osmId: 4, type: 'entrance', center: { lat: 1, lng: 1 } };
    wiring.onGeocodeResult(geocodeEvent([MAIN, inOnly, EXIT], { waypointIndex: 0 }));
    expect(picker.shown[0].entrances).toEqual([MAIN, EXIT]);
  });

  test('a via point is offered only the doors that work both ways', () => {
    const { wiring, picker } = build({ plan: makePlan(3) });
    const inOnly = { osmId: 4, type: 'entrance', center: { lat: 1, lng: 1 } };
    wiring.onGeocodeResult(geocodeEvent([MAIN, inOnly, EXIT], { waypointIndex: 1 }));
    expect(picker.shown[0].entrances).toEqual([MAIN]);
  });
});

describe('the travel mode', () => {
  const NO_CARS = {
    osmId: 5, type: 'main', center: { lat: 1, lng: 1 }, tags: { motor_vehicle: 'no' }
  };

  test('is read live, so switching profile changes what is offered', () => {
    let mode = 'foot';
    const { wiring, picker } = build({ options: { mode: () => mode } });

    wiring.onGeocodeResult(geocodeEvent([MAIN, NO_CARS]));
    expect(picker.shown[0].entrances).toEqual([MAIN, NO_CARS]);

    mode = 'driving';
    wiring.onGeocodeResult(geocodeEvent([MAIN, NO_CARS]));
    expect(picker.shown[1].entrances).toEqual([MAIN]);
  });

  test('is handed to the picker, which marks doors differently per mode', () => {
    // The picker cannot derive it: the filtering happens here, and the marks it
    // draws have to agree with the mode that filtering used.
    let mode = 'foot';
    const { wiring, picker } = build({ options: { mode: () => mode } });

    wiring.onGeocodeResult(geocodeEvent([MAIN]));
    expect(picker.shown[0].mode).toBe('foot');

    mode = 'driving';
    wiring.refresh();
    expect(picker.shown[1].mode).toBe('driving');
  });

  test('refresh re-applies the rules to the place already on screen', () => {
    let mode = 'foot';
    const { wiring, picker } = build({ options: { mode: () => mode } });
    wiring.onGeocodeResult(geocodeEvent([MAIN, NO_CARS]));

    mode = 'driving';
    expect(wiring.refresh()).toBe(true);
    expect(picker.shown[1].entrances).toEqual([MAIN]);
  });

  test('a refresh that leaves no usable door closes the picker', () => {
    let mode = 'foot';
    const { wiring, picker } = build({ options: { mode: () => mode } });
    wiring.onGeocodeResult(geocodeEvent([NO_CARS]));
    expect(picker.isOpen()).toBe(true);

    mode = 'driving';
    expect(wiring.refresh()).toBe(false);
    expect(picker.hiddenWaypoints).toEqual([1]);
    expect(picker.isOpen()).toBe(false);
  });

  test('refresh does nothing when no picker is open', () => {
    const { wiring, picker } = build({ options: { mode: () => 'foot' } });
    expect(wiring.refresh()).toBe(false);
    expect(picker.show).not.toHaveBeenCalled();
  });

  test('refresh forgets the place once the picker has been hidden', () => {
    const { wiring, picker } = build({ options: { mode: () => 'foot' } });
    wiring.onGeocodeResult(geocodeEvent([MAIN]));
    wiring.hide();
    expect(wiring.refresh()).toBe(false);
    expect(picker.show).toHaveBeenCalledTimes(1);
  });

  test('no mode supplied means no access filtering', () => {
    const { wiring, picker } = build();
    wiring.onGeocodeResult(geocodeEvent([MAIN, NO_CARS]));
    expect(picker.shown[0].entrances).toEqual([MAIN, NO_CARS]);
  });
});

describe('choosing a dot', () => {
  function chooseOn(setup, choice) {
    const built = build(setup);
    built.picker.onSelect(choice);
    return built;
  }

  const CHOICE = {
    waypointIndex: 1,
    placeName: 'Pergamonmuseum',
    latLng: MAIN.center,
    markerLatLng: CENTRE,
    entrance: MAIN
  };

  test('routes to the door and names the waypoint after it', () => {
    const { plan } = chooseOn(null, CHOICE);
    expect(plan._waypoints[1].latLng).toBe(MAIN.center);
    expect(plan._waypoints[1].name).toBe('Pergamonmuseum (main entrance)');
  });

  test('leaves the pin on the place, not on the door', () => {
    const { plan } = chooseOn(null, CHOICE);
    const wp = plan._waypoints[1];
    // The route runs to the door...
    expect(wp.latLng).toBe(MAIN.center);
    // ...while the pin is drawn at the place that was searched for.
    expect(waypointMarkerLatLng(wp)).toBe(CENTRE);
  });

  test('a waypoint with no door drawn on it pins where it routes', () => {
    const { plan } = build();
    expect(waypointMarkerLatLng(plan._waypoints[0])).toBe(plan._waypoints[0].latLng);
    expect(waypointMarkerLatLng(undefined)).toBeUndefined();
  });

  test('releasing the door puts the pin and the route back together', () => {
    const { plan, wiring } = build();
    wiring.applySelection(CHOICE);
    wiring.applySelection(Object.assign({}, CHOICE, {
      latLng: CENTRE, entrance: null
    }));
    const wp = plan._waypoints[1];
    expect(wp.latLng).toBe(CENTRE);
    expect(waypointMarkerLatLng(wp)).toBe(CENTRE);
  });

  test('writes the new name into the geocoder input', () => {
    const { plan } = chooseOn(null, CHOICE);
    expect(plan._geocoderElems[1].value).toBe('Pergamonmuseum (main entrance)');
  });

  test('redraws the markers and triggers a reroute', () => {
    const { plan } = chooseOn(null, CHOICE);
    expect(plan._updateMarkers).toHaveBeenCalled();
    expect(plan._fireChanged).toHaveBeenCalled();
  });

  test('suppresses the route refit so the view stays where the user aimed', () => {
    const { routeFitTracker } = chooseOn(null, CHOICE);
    expect(routeFitTracker.waypointDragStarted).toHaveBeenCalled();
  });

  test('releasing the door drops the suffix again', () => {
    const { plan } = chooseOn(null, Object.assign({}, CHOICE, {
      latLng: CENTRE, entrance: null
    }));
    expect(plan._waypoints[1].name).toBe('Pergamonmuseum');
    expect(plan._waypoints[1].latLng).toBe(CENTRE);
  });

  test('localises the suffix', () => {
    const de = (k) => ({ 'main entrance': 'Haupteingang' }[k] || k);
    const { plan } = chooseOn({ options: { translate: de } }, CHOICE);
    expect(plan._waypoints[1].name).toBe('Pergamonmuseum (Haupteingang)');
  });

  test('a waypoint that has since gone away is left alone', () => {
    const { wiring, plan } = build();
    const moved = wiring.applySelection(Object.assign({}, CHOICE, { waypointIndex: 7 }));
    expect(moved).toBe(false);
    expect(plan._fireChanged).not.toHaveBeenCalled();
  });

  test('works even when the plan has no geocoder inputs yet', () => {
    const plan = makePlan();
    delete plan._geocoderElems;
    const { wiring } = build({ plan });
    expect(wiring.applySelection(CHOICE)).toBe(true);
    expect(plan._waypoints[1].name).toBe('Pergamonmuseum (main entrance)');
  });
});

describe('the view while the picker is open', () => {
  test('reports whether it is open, so the route fit can stand down', () => {
    const { wiring, picker } = build();
    expect(wiring.isOpen()).toBe(false);
    wiring.onGeocodeResult(geocodeEvent([MAIN]));
    expect(wiring.isOpen()).toBe(true);
    picker.isOpen.mockClear();
    wiring.isOpen();
    expect(picker.isOpen).toHaveBeenCalled();
  });

  test('re-framing is delegated to the picker', () => {
    const { wiring, picker } = build();
    wiring.focusView();
    expect(picker.focusView).toHaveBeenCalled();
  });

  test('hide closes the picker, which is what a splice or a drag does', () => {
    const { wiring, picker } = build();
    wiring.onGeocodeResult(geocodeEvent([MAIN]));
    wiring.hide();
    expect(picker.hide).toHaveBeenCalled();
    expect(wiring.isOpen()).toBe(false);
  });
});

describe('waypointName', () => {
  test('names a door through the wiring\u2019s own translator', () => {
    const de = (k) => ({ 'main entrance': 'Haupteingang' }[k] || k);
    const { wiring } = build({ options: { translate: de } });
    expect(wiring.waypointName('Alexa', MAIN)).toBe('Alexa (Haupteingang)');
    expect(wiring.waypointName('Alexa', null)).toBe('Alexa');
  });
});

describe('createReverseNotifier', () => {
  // A reverse result: same shape a search returns, entrances included.
  const at = (lat, lng, extra) => Object.assign({
    lat: lat, lng: lng,
    distanceTo(other) {
      // Metres, near enough for a test: ~111km per degree.
      return Math.hypot(this.lat - other.lat, this.lng - other.lng) * 111000;
    }
  }, extra);

  function build(overrides) {
    const fired = [];
    const waypoints = (overrides && overrides.waypoints) || [
      { latLng: at(52.5, 13.4), name: '' }
    ];
    const plan = { _waypoints: waypoints, fire: (name, e) => fired.push({ name, e }) };
    const calls = [];
    const geocoder = {
      geocode: function() { return 'geocode'; },
      suggest: function() { return 'suggest'; },
      fetchOutline: function() { return 'outline'; },
      reverse: function(latLng, scale, cb, context) {
        calls.push({ latLng, scale });
        const results = (overrides && overrides.results !== undefined)
          ? overrides.results
          : [{ name: 'Somewhere', center: at(52.5, 13.4), entrances: [{ osmId: 1 }] }];
        cb.call(context, results);
        return 'promise';
      }
    };
    const wrapped = createReverseNotifier({
      geocoder: geocoder,
      getPlan: () => plan,
      tolerance: overrides && overrides.tolerance
    });
    return { wrapped, fired, calls, plan, geocoder };
  }

  test('re-fires the reverse result at the waypoint it belongs to', () => {
    // This is the whole point: LRM names a restored waypoint by reverse
    // geocoding and never fires `geocoded`, so the entrance list is lost.
    const { wrapped, fired } = build();
    wrapped.reverse(at(52.5, 13.4), 100, () => {});
    expect(fired).toHaveLength(1);
    expect(fired[0].name).toBe('waypointgeocoderesult');
    expect(fired[0].e.waypointIndex).toBe(0);
    expect(fired[0].e.value.entrances).toEqual([{ osmId: 1 }]);
  });

  test('finds the right waypoint among several', () => {
    const { wrapped, fired } = build({
      waypoints: [
        { latLng: at(1, 1), name: '' },
        { latLng: at(52.5, 13.4), name: '' },
        { latLng: at(2, 2), name: '' }
      ]
    });
    wrapped.reverse(at(52.5, 13.4), 100, () => {});
    expect(fired[0].e.waypointIndex).toBe(1);
    expect(fired[0].e.waypoint).toBe(fired[0].e.waypoint);
  });

  test("calls LRM's own callback first, so the waypoint is named before the offer", () => {
    const { wrapped, fired } = build();
    const order = [];
    wrapped.reverse(at(52.5, 13.4), 100, function() { order.push('lrm'); });
    order.push('fired:' + fired.length);
    expect(order).toEqual(['lrm', 'fired:1']);
  });

  test('honours the callback context and returns what the geocoder returned', () => {
    const { wrapped } = build();
    const ctx = { seen: null };
    const out = wrapped.reverse(at(52.5, 13.4), 100, function(r) { this.seen = r; }, ctx);
    expect(ctx.seen[0].name).toBe('Somewhere');
    expect(out).toBe('promise');
  });

  test('stays silent when the nearest place is beyond LRM tolerance', () => {
    // LRM labels the waypoint with bare coordinates there, so offering that
    // place's doors would offer doors of somewhere the user did not pick.
    const { wrapped, fired } = build({
      results: [{ name: 'Far away', center: at(52.6, 13.4), entrances: [{ osmId: 1 }] }]
    });
    wrapped.reverse(at(52.5, 13.4), 100, () => {});
    expect(fired).toHaveLength(0);
  });

  test('respects a tolerance supplied by the caller', () => {
    const far = [{ name: 'Down the road', center: at(52.5009, 13.4), entrances: [] }];
    expect(build({ results: far, tolerance: 50 }).wrapped
      .reverse(at(52.5, 13.4), 100, () => {}) && build({ results: far, tolerance: 50 }).fired)
      .toHaveLength(0);

    const near = build({ results: far, tolerance: 1000 });
    near.wrapped.reverse(at(52.5, 13.4), 100, () => {});
    expect(near.fired).toHaveLength(1);
  });

  test('matches the waypoint by identity, not only by coordinates', () => {
    // LRM passes wp.latLng straight through, so the common case is the very
    // same object; equality by value is the fallback for a rebuilt one.
    const same = at(52.5, 13.4);
    const { wrapped, fired } = build({ waypoints: [{ latLng: same, name: '' }] });
    wrapped.reverse(same, 100, () => {});
    expect(fired[0].e.waypointIndex).toBe(0);
  });

  test('skips a waypoint that has no position yet', () => {
    const { wrapped, fired } = build({
      waypoints: [{ latLng: null, name: '' }, { latLng: at(52.5, 13.4), name: '' }]
    });
    wrapped.reverse(at(52.5, 13.4), 100, () => {});
    expect(fired[0].e.waypointIndex).toBe(1);
  });

  test('stays silent for coordinates that are not a waypoint', () => {
    // A close-enough result, so the tolerance check passes and the lookup
    // itself is what rejects it.
    const { wrapped, fired } = build({
      results: [{ name: 'Elsewhere', center: at(10, 10), entrances: [{ osmId: 9 }] }],
      waypoints: [{ latLng: at(52.5, 13.4), name: '' }]
    });
    wrapped.reverse(at(10, 10), 100, () => {});
    expect(fired).toHaveLength(0);
  });

  test('stays silent when reverse finds nothing', () => {
    const { wrapped, fired } = build({ results: [] });
    wrapped.reverse(at(52.5, 13.4), 100, () => {});
    expect(fired).toHaveLength(0);
  });

  test('a result without a centre cannot be matched, and is skipped', () => {
    const { wrapped, fired } = build({ results: [{ name: 'No centre' }] });
    wrapped.reverse(at(52.5, 13.4), 100, () => {});
    expect(fired).toHaveLength(0);
  });

  test('the rest of the geocoder is passed through untouched', () => {
    const { wrapped } = build();
    expect(wrapped.geocode()).toBe('geocode');
    expect(wrapped.suggest()).toBe('suggest');
    expect(wrapped.fetchOutline()).toBe('outline');
  });

  test('a geocoder that cannot reverse is returned as it is', () => {
    const bare = { geocode: () => 'x' };
    expect(createReverseNotifier({ geocoder: bare })).toBe(bare);
    expect(createReverseNotifier({})).toBeUndefined();
  });

  test('a plan that is not ready yet is not an error', () => {
    const { wrapped, fired } = (() => {
      const geocoder = {
        reverse: (latLng, scale, cb, context) => {
          cb.call(context, [{ name: 'X', center: at(52.5, 13.4) }]);
        }
      };
      const fired = [];
      const wrapped = createReverseNotifier({
        geocoder, getPlan: () => undefined
      });
      return { wrapped, fired };
    })();
    expect(() => wrapped.reverse(at(52.5, 13.4), 100, () => {})).not.toThrow();
    expect(fired).toHaveLength(0);
  });
});

describe('splicing the waypoint list', () => {
  test("a destination placed by clicking the map keeps the start's offer", () => {
    // The reported bug, at the wiring level: the splice handler used to hide
    // every offer.
    const plan = makePlan(2);
    const { wiring, picker } = build({ plan });
    wiring.onGeocodeResult(geocodeEvent([MAIN], { waypointIndex: 0 }));
    expect(picker.isOpenFor(0)).toBe(true);

    wiring.spliceWaypoints({ index: 1, nRemoved: 0, added: [{}] });
    expect(picker.hide).not.toHaveBeenCalled();
    expect(picker.isOpenFor(0)).toBe(true);
  });

  test('a remembered result moves with its waypoint, so refresh stays correct', () => {
    let mode = 'foot';
    const plan = makePlan(3);
    const { wiring, picker } = build({ plan, options: { mode: () => mode } });
    wiring.onGeocodeResult(geocodeEvent([MAIN], { waypointIndex: 1 }));

    wiring.spliceWaypoints({ index: 0, nRemoved: 0, added: [{}] });
    mode = 'driving';
    wiring.refresh();

    // Re-offered against the index the waypoint now has, not the old one.
    expect(picker.shown[picker.shown.length - 1].waypointIndex).toBe(2);
  });

  test('a removed waypoint takes its remembered result with it', () => {
    const plan = makePlan(2);
    const { wiring, picker } = build({ plan });
    wiring.onGeocodeResult(geocodeEvent([MAIN], { waypointIndex: 1 }));

    wiring.spliceWaypoints({ index: 1, nRemoved: 1, added: [] });
    expect(wiring.refresh()).toBe(false);
    expect(picker.shown).toHaveLength(1);
  });

  test('reversing the route re-offers the doors the new roles allow', () => {
    // The reported bug. An entrance=exit can be left through but not entered,
    // so it is right to offer nothing while the place is the destination — and
    // wrong to keep offering nothing once it becomes the start. LRM's reverse
    // button replaces the whole list, so this arrives as a splice of everything.
    const plan = makePlan(2);
    const [first, second] = plan._waypoints;
    const { wiring, picker } = build({ plan });

    wiring.onGeocodeResult(geocodeEvent([EXIT], { waypointIndex: 1, waypoint: second }));
    expect(picker.isOpenFor(1)).toBe(false);

    plan._waypoints.reverse();
    wiring.spliceWaypoints({ index: 0, nRemoved: 2, added: [second, first] });

    expect(picker.isOpenFor(0)).toBe(true);
    const offer = picker.shown[picker.shown.length - 1];
    expect(offer.waypointIndex).toBe(0);
    expect(offer.entrances).toEqual([EXIT]);
  });

  test('a door that only works at the end is withdrawn when it becomes a via', () => {
    // The mirror of the same gap: entrance=entrance is one-way in, so it is no
    // use at a stop that must also be left again.
    const plan = makePlan(2);
    const { wiring, picker } = build({ plan });
    wiring.onGeocodeResult(geocodeEvent([WAY_IN], { waypointIndex: 1, waypoint: plan._waypoints[1] }));
    expect(picker.isOpenFor(1)).toBe(true);

    // A third waypoint appended after it: index 1 is now a via.
    plan._waypoints.push({ latLng: null, name: '' });
    wiring.spliceWaypoints({ index: 2, nRemoved: 0, added: [plan._waypoints[2]] });

    expect(picker.isOpenFor(1)).toBe(false);
    expect(picker.hiddenWaypoints).toContain(1);
  });

  test('a splice that leaves the roles alone does not re-offer anything', () => {
    const plan = makePlan(3);
    const { wiring, picker } = build({ plan });
    wiring.onGeocodeResult(geocodeEvent([MAIN], { waypointIndex: 0, waypoint: plan._waypoints[0] }));
    const before = picker.shown.length;

    // A waypoint appended at the end: index 0 is the origin either way.
    plan._waypoints.push({ latLng: null, name: '' });
    wiring.spliceWaypoints({ index: 3, nRemoved: 0, added: [plan._waypoints[3]] });

    expect(picker.shown).toHaveLength(before);
    expect(picker.isOpenFor(0)).toBe(true);
  });

  test('a waypoint replaced by a different one does not inherit its doors', () => {
    // Identity, not position, is what says a waypoint survived a splice.
    const plan = makePlan(2);
    const { wiring, picker } = build({ plan });
    wiring.onGeocodeResult(geocodeEvent([MAIN], { waypointIndex: 1, waypoint: plan._waypoints[1] }));

    plan._waypoints[1] = { latLng: null, name: '' };
    wiring.spliceWaypoints({ index: 1, nRemoved: 1, added: [plan._waypoints[1]] });

    expect(wiring.refresh()).toBe(false);
    expect(picker.shown).toHaveLength(1);
  });

  test('dragging a waypoint withdraws only its own offer', () => {
    const plan = makePlan(2);
    const { wiring, picker } = build({ plan });
    wiring.onGeocodeResult(geocodeEvent([MAIN], { waypointIndex: 0 }));
    wiring.onGeocodeResult(geocodeEvent([MAIN], { waypointIndex: 1 }));

    wiring.hideWaypoint(1);
    expect(picker.hiddenWaypoints).toEqual([1]);
    expect(picker.hide).not.toHaveBeenCalled();
    expect(picker.isOpenFor(0)).toBe(true);
  });
});
