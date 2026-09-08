'use strict';

// Mock leaflet so this test runs in the node environment without a DOM. The
// functions exercised here are the pure ones; only createEntrancePicker touches
// Leaflet, and it is covered in entrance_picker_instance.test.js.
jest.mock('leaflet', () => ({
  layerGroup: () => ({}),
  marker: () => ({}),
  divIcon: () => ({}),
  latLngBounds: () => ({}),
  point: () => ({}),
  polyline: () => ({}),
  DomEvent: { stopPropagation: () => {} }
}));

/**
 * The wiring between the routing plan and the entrance picker: which doors an
 * offer is built from, what choosing one does to the waypoint, and who owns the
 * map view afterwards. The picker itself is faked, so this is about the wiring.
 */

const {
  createEntranceWaypoints,
  createReverseNotifier,
  entranceWaypointName,
  waypointMarkerLatLng
} = require('../src/entrance_waypoints');

const CENTRE = { lat: 52.5209336, lng: 13.3956302 };
const DOOR = { lat: 52.5209566, lng: 13.3965227 };
const MAIN = { osmId: 1, type: 'main', center: DOOR };
const EXIT = { osmId: 2, type: 'exit', center: DOOR };
// entrance=entrance is a one-way in, so it is no use at an origin.
const IN_ONLY = { osmId: 3, type: 'entrance', center: DOOR };

function makePlan(count) {
  const waypoints = [];
  for (let i = 0; i < (count || 2); i++) waypoints.push({ latLng: null, name: '' });
  return {
    _waypoints: waypoints,
    _geocoderElems: waypoints.map(() => ({ value: null, setValue(v) { this.value = v; } })),
    updatedMarkers: 0,
    changes: 0,
    _updateMarkers() { this.updatedMarkers++; },
    _fireChanged() { this.changes++; }
  };
}

function makeTracker() {
  return { dragStarts: 0, waypointDragStarted() { this.dragStarts++; } };
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
    isOpenFor: jest.fn((waypointIndex) => picker.openFor.has(waypointIndex))
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
      entrances
    }
  }, overrides);
}

describe('entranceWaypointName', () => {
  test('says which door the waypoint sits on', () => {
    expect(entranceWaypointName('Pergamonmuseum', MAIN)).toBe('Pergamonmuseum (main entrance)');
    expect(entranceWaypointName('Pergamonmuseum', { type: 'yes' })).toBe('Pergamonmuseum (entrance)');
  });

  // An exit is only offered at an origin, where calling it an entrance would
  // contradict the reason it is on offer.
  test('an exit is called an exit', () => {
    expect(entranceWaypointName('Alexa', EXIT)).toBe('Alexa (exit)');
  });

  test('a door that names itself is named, not described', () => {
    const named = { type: 'main', tags: { name: 'Haupteingang Alexanderplatz' } };
    expect(entranceWaypointName('Alexa', named)).toBe('Alexa (Haupteingang Alexanderplatz)');
  });

  test('the place itself keeps its own name', () => {
    expect(entranceWaypointName('Pergamonmuseum', null)).toBe('Pergamonmuseum');
  });

  test('the wording goes through the translator', () => {
    const de = (key) => ({ 'main entrance': 'Haupteingang' })[key] || key;
    expect(entranceWaypointName('Alexa', MAIN, de)).toBe('Alexa (Haupteingang)');
  });
});

describe('waypointMarkerLatLng', () => {
  test('draws the pin where the route runs, unless a place was kept', () => {
    expect(waypointMarkerLatLng({ latLng: DOOR })).toBe(DOOR);
    expect(waypointMarkerLatLng({ latLng: DOOR, _entranceMarkerLatLng: CENTRE })).toBe(CENTRE);
    expect(waypointMarkerLatLng(null)).toBeFalsy();
  });
});

describe('building the offer', () => {
  test('a geocoded place with doors is handed to the picker', () => {
    const { wiring, picker } = build();
    expect(wiring.onGeocodeResult(geocodeEvent([MAIN]))).toBe(true);
    expect(picker.shown[0]).toEqual(expect.objectContaining({
      waypointIndex: 1,
      placeCenter: CENTRE,
      entrances: [MAIN]
    }));
  });

  test('the doors are filtered by which end of the route the waypoint is', () => {
    // The destination of a two-waypoint route: an exit cannot be entered.
    const { wiring, picker } = build();
    expect(wiring.onGeocodeResult(geocodeEvent([MAIN, EXIT]))).toBe(true);
    expect(picker.shown[0].entrances).toEqual([MAIN]);

    // The same place as the origin: now the exit is exactly what is wanted.
    wiring.onGeocodeResult(geocodeEvent([MAIN, EXIT], { waypointIndex: 0 }));
    expect(picker.shown[1].entrances).toEqual([MAIN, EXIT]);
  });

  test('a place with no usable door withdraws its own offer, and only its own', () => {
    const plan = makePlan(3);
    const { wiring, picker } = build({ plan });
    // A via with doors, then a start with none: the via keeps its dots.
    wiring.onGeocodeResult(geocodeEvent([MAIN], { waypointIndex: 1 }));
    expect(wiring.onGeocodeResult(geocodeEvent([IN_ONLY], { waypointIndex: 0 }))).toBe(false);
    expect(picker.hiddenWaypoints).toEqual([0]);
    expect(picker.hidden).toBe(0);
    expect(picker.isOpenFor(1)).toBe(true);
  });

  test('a geocode with no result at all is not an error', () => {
    const { wiring, picker } = build();
    expect(wiring.onGeocodeResult({ waypointIndex: 1, value: null })).toBe(false);
    expect(picker.show).not.toHaveBeenCalled();
    expect(picker.hiddenWaypoints).toEqual([1]);
  });
});

describe('choosing a door', () => {
  test('routes to the door, names the waypoint for it, and leaves the pin', () => {
    const { wiring, plan, picker } = build();
    wiring.onGeocodeResult(geocodeEvent([MAIN]));
    picker.onSelect({
      waypointIndex: 1,
      placeName: 'Pergamonmuseum',
      latLng: DOOR,
      markerLatLng: CENTRE,
      entrance: MAIN
    });

    expect(plan._waypoints[1].latLng).toBe(DOOR);
    expect(plan._waypoints[1].name).toBe('Pergamonmuseum (main entrance)');
    expect(plan._waypoints[1]._entranceMarkerLatLng).toBe(CENTRE);
    expect(plan._geocoderElems[1].value).toBe('Pergamonmuseum (main entrance)');
  });

  test('the input and the markers are refreshed, and the route recomputed', () => {
    const { wiring, plan, picker } = build();
    wiring.onGeocodeResult(geocodeEvent([MAIN]));
    picker.onSelect({ waypointIndex: 1, placeName: 'X', latLng: DOOR, markerLatLng: CENTRE });
    expect(plan.updatedMarkers).toBe(1);
    expect(plan.changes).toBe(1);
  });

  // The user aimed at a point on the map; the recomputed route must not drag
  // the view off it.
  test('the route that follows leaves the view alone', () => {
    const { wiring, routeFitTracker, picker } = build();
    wiring.onGeocodeResult(geocodeEvent([MAIN]));
    picker.onSelect({ waypointIndex: 1, placeName: 'X', latLng: DOOR, markerLatLng: CENTRE });
    expect(routeFitTracker.dragStarts).toBe(1);
  });

  test('routing back to the place takes the pin override off again', () => {
    const { wiring, plan, picker } = build();
    wiring.onGeocodeResult(geocodeEvent([MAIN]));
    picker.onSelect({ waypointIndex: 1, placeName: 'X', latLng: DOOR, markerLatLng: CENTRE, entrance: MAIN });
    picker.onSelect({ waypointIndex: 1, placeName: 'X', latLng: CENTRE, markerLatLng: CENTRE, entrance: null });
    expect(plan._waypoints[1].latLng).toBe(CENTRE);
    expect(plan._waypoints[1]._entranceMarkerLatLng).toBeUndefined();
    expect(plan._waypoints[1].name).toBe('X');
  });

  test('a selection for a waypoint that no longer exists changes nothing', () => {
    const { wiring, plan } = build();
    expect(wiring.applySelection({ waypointIndex: 9, placeName: 'X', latLng: DOOR })).toBe(false);
    expect(plan.changes).toBe(0);
  });
});

describe('claimView', () => {
  // The route that follows the geocode which opened a picker must not fit
  // itself over the doors the picker just framed. Any other route is not the
  // picker's doing.
  test('the geocode that frames the doors claims the next route, once', () => {
    const { wiring } = build();
    expect(wiring.claimView()).toBe(false);
    wiring.onGeocodeResult(geocodeEvent([MAIN]));
    expect(wiring.claimView()).toBe(true);
    expect(wiring.claimView()).toBe(false);
  });

  test('an offer withdrawn before the route arrives takes its claim with it', () => {
    // Escape, or a drag: the route that follows must fit as usual, or the map
    // is left showing wherever the doors had been.
    const { wiring } = build();
    wiring.onGeocodeResult(geocodeEvent([MAIN]));
    wiring.hide();
    expect(wiring.claimView()).toBe(false);
  });

  test('a later geocode with no usable door withdraws the earlier claim', () => {
    const { wiring } = build();
    wiring.onGeocodeResult(geocodeEvent([MAIN]));
    // The same waypoint, so its offer — and the claim with it — is withdrawn.
    wiring.onGeocodeResult(geocodeEvent([EXIT]));
    expect(wiring.claimView()).toBe(false);
  });

  test('a geocode with no usable door claims nothing', () => {
    const { wiring } = build();
    wiring.onGeocodeResult(geocodeEvent([EXIT]));
    expect(wiring.claimView()).toBe(false);
  });
});

describe('hide', () => {
  test('closes the picker, which is what a splice or a drag does', () => {
    const { wiring, picker } = build();
    wiring.onGeocodeResult(geocodeEvent([MAIN]));
    wiring.hide();
    expect(picker.hidden).toBe(1);
    expect(wiring.isOpen()).toBe(false);
  });
});

describe('travel mode', () => {
  const NO_CARS = {
    osmId: 5, type: 'main', center: DOOR, tags: { motor_vehicle: 'no' }
  };

  test('is read live, so switching profile changes what is offered', () => {
    let mode = 'foot';
    const { wiring, picker } = build({ options: { mode: () => mode } });
    wiring.onGeocodeResult(geocodeEvent([MAIN, NO_CARS]));
    expect(picker.shown[0].entrances).toEqual([MAIN, NO_CARS]);
    expect(picker.shown[0].mode).toBe('foot');

    mode = 'driving';
    expect(wiring.refresh()).toBe(true);
    expect(picker.shown[1].entrances).toEqual([MAIN]);
    expect(picker.shown[1].mode).toBe('driving');
  });

  // The user did not ask to be taken back to the doors just by changing profile.
  test('a refresh redraws the doors where they are and claims no view', () => {
    let mode = 'foot';
    const { wiring, picker } = build({ options: { mode: () => mode } });
    wiring.onGeocodeResult(geocodeEvent([MAIN, NO_CARS]));
    expect(picker.shown[0].frame).toBe(true);
    wiring.claimView();

    mode = 'driving';
    wiring.refresh();
    expect(picker.shown[1].frame).toBe(false);
    expect(wiring.claimView()).toBe(false);
  });

  // The mirror of the case below: a mode switch can make a door usable that was
  // not, and the place is still the one on screen.
  test('a refresh reopens an offer the previous mode had emptied', () => {
    let mode = 'driving';
    const { wiring, picker } = build({ options: { mode: () => mode } });
    expect(wiring.onGeocodeResult(geocodeEvent([NO_CARS]))).toBe(false);
    expect(picker.open).toBe(false);

    mode = 'foot';
    expect(wiring.refresh()).toBe(true);
    expect(picker.open).toBe(true);
    expect(picker.shown[0].entrances).toEqual([NO_CARS]);
  });

  test('a refresh that leaves no usable door withdraws that offer', () => {
    let mode = 'foot';
    const { wiring, picker } = build({ options: { mode: () => mode } });
    wiring.onGeocodeResult(geocodeEvent([NO_CARS]));

    mode = 'driving';
    expect(wiring.refresh()).toBe(false);
    expect(picker.hiddenWaypoints).toEqual([1]);
    expect(picker.open).toBe(false);
  });

  test('refresh does nothing when no picker is open', () => {
    const { wiring, picker } = build();
    expect(wiring.refresh()).toBe(false);
    expect(picker.show).not.toHaveBeenCalled();
  });

  // hide() is the deliberate dismissal, and it ends the offer for good.
  test('refresh forgets the place once the picker has been hidden', () => {
    const { wiring } = build({ options: { mode: () => 'foot' } });
    wiring.onGeocodeResult(geocodeEvent([MAIN]));
    wiring.hide();
    expect(wiring.refresh()).toBe(false);
  });

  test('no mode supplied means no access filtering', () => {
    const { wiring, picker } = build();
    wiring.onGeocodeResult(geocodeEvent([MAIN, NO_CARS]));
    expect(picker.shown[0].entrances).toEqual([MAIN, NO_CARS]);
    expect(picker.shown[0].mode).toBeNull();
  });
});

describe('following a splice of the waypoint list', () => {
  test('a remembered result moves with its waypoint, so a refresh stays correct', () => {
    const plan = makePlan(3);
    const { wiring, picker } = build({ plan, options: { mode: () => 'foot' } });
    wiring.onGeocodeResult(geocodeEvent([MAIN], { waypointIndex: 1, waypoint: plan._waypoints[1] }));

    // A waypoint inserted at the front pushes it to index 2.
    plan._waypoints.unshift({ latLng: null, name: '' });
    wiring.spliceWaypoints({ index: 0, nRemoved: 0, added: [plan._waypoints[0]] });

    wiring.refresh();
    expect(picker.shown[picker.shown.length - 1].waypointIndex).toBe(2);
  });

  test('a removed waypoint takes its remembered place with it', () => {
    const plan = makePlan(3);
    const { wiring, picker } = build({ plan });
    wiring.onGeocodeResult(geocodeEvent([MAIN], { waypointIndex: 1, waypoint: plan._waypoints[1] }));

    plan._waypoints.splice(1, 1);
    wiring.spliceWaypoints({ index: 1, nRemoved: 1, added: [] });

    expect(wiring.refresh()).toBe(false);
    expect(picker.shown).toHaveLength(1);
  });

  // The reported bug behind this slice. An entrance=exit can be left through
  // but not entered, so it is right to offer nothing while the place is the
  // destination — and wrong to keep offering nothing once it becomes the start.
  // LRM's reverse button replaces the whole list, so this arrives as a splice
  // of everything, with the same waypoint objects in a new order.
  test('reversing the route re-offers the doors the new roles allow', () => {
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
    // Redrawn where it is: a reorder is not a request to be taken to the doors.
    expect(offer.frame).toBe(false);
  });

  // A three-waypoint reverse: the ends swap roles, the middle stays a via. Its
  // offer is inside the removed range like every other, so it has to be put
  // back even though nothing about its role changed.
  test('reversing a longer route keeps the middle waypoint\'s offer', () => {
    const plan = makePlan(3);
    const [first, middle, last] = plan._waypoints;
    const { wiring, picker } = build({ plan });
    wiring.onGeocodeResult(geocodeEvent([MAIN], { waypointIndex: 1, waypoint: middle }));
    expect(picker.isOpenFor(1)).toBe(true);

    plan._waypoints.reverse();
    wiring.spliceWaypoints({ index: 0, nRemoved: 3, added: [last, middle, first] });

    expect(picker.isOpenFor(1)).toBe(true);
  });

  test('a splice that leaves the roles alone re-offers nothing', () => {
    const plan = makePlan(3);
    const { wiring, picker } = build({ plan });
    wiring.onGeocodeResult(geocodeEvent([MAIN], { waypointIndex: 1, waypoint: plan._waypoints[1] }));
    const shownBefore = picker.shown.length;

    // A via stays a via when another waypoint is added after it.
    plan._waypoints.splice(2, 0, { latLng: null, name: '' });
    wiring.spliceWaypoints({ index: 2, nRemoved: 0, added: [plan._waypoints[2]] });

    expect(picker.shown).toHaveLength(shownBefore);
  });

  test('a waypoint that becomes a via loses the one-way doors', () => {
    const plan = makePlan(2);
    const { wiring, picker } = build({ plan });
    // The destination, where a one-way in is exactly right.
    wiring.onGeocodeResult(geocodeEvent([IN_ONLY], { waypointIndex: 1, waypoint: plan._waypoints[1] }));
    expect(picker.isOpenFor(1)).toBe(true);

    // A waypoint appended after it makes it a via, which needs both directions.
    plan._waypoints.push({ latLng: null, name: '' });
    wiring.spliceWaypoints({ index: 2, nRemoved: 0, added: [plan._waypoints[2]] });

    expect(picker.hiddenWaypoints).toContain(1);
  });

  // The event belongs to LRM and its other listeners; renumbering happens on a
  // copy of our own.
  test('a splice does not rewrite the event the plan fired', () => {
    const plan = makePlan(3);
    const { wiring } = build({ plan });
    const event = geocodeEvent([MAIN], { waypointIndex: 1, waypoint: plan._waypoints[1] });
    wiring.onGeocodeResult(event);

    plan._waypoints.unshift({ latLng: null, name: '' });
    wiring.spliceWaypoints({ index: 0, nRemoved: 0, added: [plan._waypoints[0]] });

    expect(event.waypointIndex).toBe(1);
  });

  test('hideWaypoint forgets the place as well as withdrawing the dots', () => {
    const { wiring, picker } = build();
    wiring.onGeocodeResult(geocodeEvent([MAIN]));
    wiring.hideWaypoint(1);
    expect(picker.hiddenWaypoints).toEqual([1]);
    expect(wiring.refresh()).toBe(false);
  });

  test('a refresh re-applies to every place remembered, not just the newest', () => {
    const plan = makePlan(3);
    let mode = 'foot';
    const { wiring, picker } = build({ plan, options: { mode: () => mode } });
    wiring.onGeocodeResult(geocodeEvent([MAIN], { waypointIndex: 0, waypoint: plan._waypoints[0] }));
    wiring.onGeocodeResult(geocodeEvent([MAIN], { waypointIndex: 2, waypoint: plan._waypoints[2] }));
    const shownBefore = picker.shown.length;

    mode = 'driving';
    expect(wiring.refresh()).toBe(true);
    const redrawn = picker.shown.slice(shownBefore);
    expect(redrawn.map((o) => o.waypointIndex).sort()).toEqual([0, 2]);
    expect(redrawn.every((o) => o.mode === 'driving' && o.frame === false)).toBe(true);
  });
});

describe('reverse-geocoded waypoints reaching the picker', () => {
  // A reverse result: the same shape a search returns, entrances included.
  const RESULT = { name: 'Pergamonmuseum', center: latLng(52.5209336, 13.3956302),
    entrances: [MAIN] };

  // Leaflet's LatLng, as much of it as this needs.
  function latLng(lat, lng) {
    return {
      lat, lng,
      distanceTo(other) {
        // Plane approximation; the numbers here are metres apart, not degrees.
        const dx = (other.lng - lng) * 68000;
        const dy = (other.lat - lat) * 111000;
        return Math.sqrt(dx * dx + dy * dy);
      }
    };
  }

  function build(extra) {
    const at = (extra && extra.at) || latLng(52.5209336, 13.3956302);
    const plan = {
      _waypoints: [{ latLng: null, name: '' }, { latLng: at, name: '' }],
      fired: [],
      fire(type, data) { this.fired.push({ type, data }); }
    };
    const results = (extra && extra.results !== undefined) ? extra.results : [RESULT];
    const geocoder = {
      name: 'inner',
      reverse: jest.fn(function(ll, scale, cb, context) {
        if (typeof cb === 'function') cb.call(context, results);
        return 'returned';
      }),
      geocode: jest.fn(function() { return this.name; })
    };
    const wrapped = createReverseNotifier(Object.assign(
      { geocoder, getPlan: () => plan }, extra && extra.options));
    return { plan, geocoder, wrapped, at };
  }

  test('re-fires the reverse result at the waypoint it belongs to', () => {
    // The whole point: LRM names a restored waypoint by reverse geocoding and
    // then throws the result away, entrance list and all.
    const { plan, wrapped, at } = build();
    wrapped.reverse(at, 100, () => {});
    expect(plan.fired).toHaveLength(1);
    expect(plan.fired[0].type).toBe('waypointgeocoderesult');
    expect(plan.fired[0].data).toEqual({
      waypointIndex: 1, waypoint: plan._waypoints[1], value: RESULT
    });
  });

  test('LRM is called back first, so the waypoint is named before the offer', () => {
    const order = [];
    const { plan, wrapped, at } = build();
    plan.fire = () => order.push('picker');
    wrapped.reverse(at, 100, () => order.push('lrm'));
    expect(order).toEqual(['lrm', 'picker']);
  });

  test('the caller keeps its own callback context and return value', () => {
    const ctx = { seen: null };
    const { wrapped, at } = build();
    const out = wrapped.reverse(at, 100, function(r) { this.seen = r; }, ctx);
    expect(ctx.seen).toEqual([RESULT]);
    expect(out).toBe('returned');
  });

  test('a coordinate matching no waypoint fires nothing', () => {
    const { plan, wrapped } = build();
    wrapped.reverse(latLng(1, 1), 100, () => {});
    expect(plan.fired).toEqual([]);
  });

  // Beyond LRM's tolerance it labels the waypoint with bare coordinates rather
  // than the place, so offering that place's doors would offer doors of
  // somewhere the user did not pick.
  test('a result too far from the waypoint is not offered', () => {
    const far = { name: 'Elsewhere', center: latLng(52.53, 13.40), entrances: [MAIN] };
    const { plan, wrapped, at } = build({ results: [far] });
    wrapped.reverse(at, 100, () => {});
    expect(plan.fired).toEqual([]);
  });

  test('the tolerance is configurable, and a near result still passes', () => {
    // About 10 m from the waypoint.
    const near = { name: 'Next door', center: latLng(52.5210236, 13.3956302),
      entrances: [MAIN] };
    const { plan, wrapped, at } = build({ results: [near], options: { tolerance: 5 } });
    wrapped.reverse(at, 100, () => {});
    expect(plan.fired).toEqual([]);

    const loose = build({ results: [near], options: { tolerance: 5000 } });
    loose.wrapped.reverse(loose.at, 100, () => {});
    expect(loose.plan.fired).toHaveLength(1);
  });

  test('an empty or malformed result is not an error', () => {
    [[], null, [{}]].forEach((results) => {
      const { plan, wrapped, at } = build({ results });
      expect(() => wrapped.reverse(at, 100, () => {})).not.toThrow();
      expect(plan.fired).toEqual([]);
    });
  });

  test('the waypoint is matched by identity as well as by value', () => {
    const { plan, wrapped } = build();
    // A different object with the same coordinates still finds its waypoint.
    wrapped.reverse(latLng(52.5209336, 13.3956302), 100, () => {});
    expect(plan.fired).toHaveLength(1);
  });

  test('a plan that does not exist yet is simply not notified', () => {
    const geocoder = { reverse: (ll, scale, cb) => cb([RESULT]) };
    const wrapped = createReverseNotifier({ geocoder, getPlan: () => null });
    expect(() => wrapped.reverse(latLng(52.5, 13.4), 100, () => {})).not.toThrow();
  });

  test('every other geocoder method is passed through, bound to the original', () => {
    const { geocoder, wrapped } = build();
    expect(wrapped.geocode()).toBe('inner');
    expect(wrapped.name).toBe('inner');
  });

  test('a geocoder that cannot reverse is handed back untouched', () => {
    const plain = { geocode: () => {} };
    expect(createReverseNotifier({ geocoder: plain, getPlan: () => ({}) })).toBe(plain);
    expect(createReverseNotifier({})).toBeUndefined();
  });
});
