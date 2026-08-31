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

const { createEntranceWaypoints, entranceWaypointName, waypointMarkerLatLng } =
  require('../src/entrance_waypoints');

const MAIN = { osmId: 1, type: 'main', center: { lat: 52.5209566, lng: 13.3965227 } };
const SIDE = { osmId: 2, type: 'yes', center: { lat: 52.5207240, lng: 13.3974377 } };
const EXIT = { osmId: 3, type: 'exit', center: { lat: 52.5206, lng: 13.3980 } };
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
    open: false,
    onSelect: null,
    options: null,
    show: jest.fn(function(opts) { picker.shown.push(opts); picker.open = true; return true; }),
    hide: jest.fn(function() { picker.hidden++; picker.open = false; }),
    isOpen: jest.fn(() => picker.open),
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

  test('closes the picker for a place with no entrances', () => {
    const { wiring, picker } = build();
    expect(wiring.onGeocodeResult(geocodeEvent(undefined))).toBe(false);
    expect(picker.hide).toHaveBeenCalled();
    expect(picker.show).not.toHaveBeenCalled();
  });

  test('closes the picker when the result itself is missing', () => {
    const { wiring, picker } = build();
    expect(wiring.onGeocodeResult({ waypointIndex: 0, value: null })).toBe(false);
    expect(picker.hide).toHaveBeenCalled();
  });

  test('closes the picker when every entrance is unusable', () => {
    const service = { osmId: 9, type: 'service', center: { lat: 1, lng: 1 } };
    const { wiring, picker } = build();
    expect(wiring.onGeocodeResult(geocodeEvent([service]))).toBe(false);
    expect(picker.hide).toHaveBeenCalled();
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
    expect(picker.hide).toHaveBeenCalled();
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
