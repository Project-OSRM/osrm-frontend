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
  entranceWaypointName,
  waypointMarkerLatLng
} = require('../src/entrance_waypoints');

const CENTRE = { lat: 52.5209336, lng: 13.3956302 };
const DOOR = { lat: 52.5209566, lng: 13.3965227 };
const MAIN = { osmId: 1, type: 'main', center: DOOR };
const EXIT = { osmId: 2, type: 'exit', center: DOOR };

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
    open: false,
    onSelect: null,
    show: jest.fn(function(opts) {
      picker.shown.push(opts);
      picker.open = true;
      return true;
    }),
    hide: jest.fn(function() {
      picker.hidden++;
      picker.open = false;
    }),
    isOpen: jest.fn(() => picker.open)
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

  test('a place with no usable door withdraws the offer instead of showing one', () => {
    const { wiring, picker } = build();
    expect(wiring.onGeocodeResult(geocodeEvent([EXIT]))).toBe(false);
    expect(picker.show).not.toHaveBeenCalled();
    expect(picker.hidden).toBe(1);
  });

  test('a geocode with no result at all is not an error', () => {
    const { wiring, picker } = build();
    expect(wiring.onGeocodeResult({ waypointIndex: 1, value: null })).toBe(false);
    expect(picker.show).not.toHaveBeenCalled();
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

  test('a refresh that leaves no usable door closes the picker', () => {
    let mode = 'foot';
    const { wiring, picker } = build({ options: { mode: () => mode } });
    wiring.onGeocodeResult(geocodeEvent([NO_CARS]));

    mode = 'driving';
    expect(wiring.refresh()).toBe(false);
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
