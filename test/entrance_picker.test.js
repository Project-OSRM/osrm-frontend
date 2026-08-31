'use strict';

// Mock leaflet so this test runs in the node environment without a DOM. The
// functions exercised here are the pure ones; only createEntrancePicker touches
// Leaflet, and it is covered end-to-end in the browser instead.
jest.mock('leaflet', () => ({
  layerGroup: () => ({}),
  marker: () => ({}),
  divIcon: () => ({}),
  latLngBounds: () => ({}),
  DomEvent: { stopPropagation: () => {} }
}));

const entrancePicker = require('../src/entrance_picker');

function entrance(osmId, type, lat, lng) {
  return { osmId: osmId, type: type, center: { lat: lat, lng: lng } };
}

// BER publishes five entrances, every one of them tagged entrance=main. It is
// the case the picker exists for: there is no single "main" one to prefer.
const BER = [
  entrance(9942967218, 'main', 52.36361, 13.5100542),
  entrance(9942967219, 'main', 52.3650916, 13.5091228),
  entrance(9944430790, 'main', 52.3653507, 13.5086652),
  entrance(9959231437, 'main', 52.3641971, 13.5096892),
  entrance(9959231438, 'main', 52.3645019, 13.5094986)
];

// Pergamonmuseum has one main door and one secondary one.
const PERGAMON = [
  entrance(1, 'main', 52.5209566, 13.3965227),
  entrance(2, 'yes', 52.520724, 13.3974377)
];

// Directions follow the OSM wiki's own definitions of the one-way values:
//   entrance=exit      "it is a one-way out of a building or enclosed area"
//   entrance=entrance  "it is an entrance only, a one-way in"
describe('routableEntrances', () => {
  const ALL = [
    entrance(1, 'main', 1, 1),
    entrance(2, 'yes', 2, 2),
    entrance(3, 'secondary', 3, 3),
    entrance(4, 'shop', 4, 4),
    entrance(5, 'home', 5, 5),
    entrance(6, 'entrance', 6, 6),
    entrance(7, 'exit', 7, 7),
    entrance(8, 'service', 8, 8),
    entrance(9, 'emergency', 9, 9),
    entrance(10, 'staircase', 10, 10),
    entrance(11, 'garage', 11, 11),
    entrance(12, 'no', 12, 12)
  ];
  const ids = (role) => entrancePicker.routableEntrances(ALL, role).map((e) => e.osmId);

  test('a destination takes the two-way doors and the entrance-only one', () => {
    expect(ids('destination')).toEqual([1, 2, 3, 4, 5, 6]);
  });

  test('an origin takes the two-way doors and the exit-only one', () => {
    expect(ids('origin')).toEqual([1, 2, 3, 4, 5, 7]);
  });

  test('a via point is arrived at and left, so only two-way doors qualify', () => {
    expect(ids('via')).toEqual([1, 2, 3, 4, 5]);
  });

  test('an exit is never offered as a destination, an entrance never as an origin', () => {
    expect(ids('destination')).not.toContain(7);
    expect(ids('origin')).not.toContain(6);
  });

  test('doors that are nobody’s route endpoint are always dropped', () => {
    // service, emergency, staircase, garage, and no — the last of which the wiki
    // defines as looking like a door but not being usable at all.
    [8, 9, 10, 11, 12].forEach((id) => {
      ['origin', 'destination', 'via'].forEach((role) => {
        expect(ids(role)).not.toContain(id);
      });
    });
  });

  test('defaults to the strictest role when none is given', () => {
    expect(entrancePicker.routableEntrances(ALL).map((e) => e.osmId)).toEqual(ids('via'));
  });

  test('drops entrances without coordinates and tolerates non-arrays', () => {
    expect(entrancePicker.routableEntrances([{ osmId: 1, type: 'main' }], 'destination')).toEqual([]);
    expect(entrancePicker.routableEntrances(null, 'destination')).toEqual([]);
    expect(entrancePicker.routableEntrances(undefined, 'destination')).toEqual([]);
  });
});

// Doors carry OSM access tags, and Nominatim returns them on every entrance
// without being asked. A door the selected mode may not use is not offered.
// Most doors have no name — which is why the picker is a map, not a list — but
// Alexa's are signed and OSM records the signage.
describe('entranceName', () => {
  const door = (tags) => ({ osmId: 1, type: 'main', center: { lat: 1, lng: 1 }, tags });

  test('takes the name OSM gives the door', () => {
    expect(entrancePicker.entranceName(door({ name: 'Haupteingang Alexanderplatz' })))
      .toBe('Haupteingang Alexanderplatz');
  });

  test('falls back to ref for a door that is numbered rather than named', () => {
    expect(entrancePicker.entranceName(door({ ref: 'E0' }))).toBe('E0');
    expect(entrancePicker.entranceName(door({ name: 'Nord', ref: 'E0' }))).toBe('Nord');
  });

  test('an unnamed door has nothing to offer', () => {
    expect(entrancePicker.entranceName(door(undefined))).toBeNull();
    expect(entrancePicker.entranceName(door({ wheelchair: 'yes' }))).toBeNull();
    expect(entrancePicker.entranceName(undefined)).toBeNull();
  });

  test('whitespace-only and non-string names are ignored', () => {
    expect(entrancePicker.entranceName(door({ name: '   ' }))).toBeNull();
    expect(entrancePicker.entranceName(door({ name: 42 }))).toBeNull();
  });

  test('a padded name is trimmed', () => {
    expect(entrancePicker.entranceName(door({ name: '  Eingang Ravelinplatz ' })))
      .toBe('Eingang Ravelinplatz');
  });
});

const box = (l, t, r, b) => ({ left: l, top: t, right: r, bottom: b });

describe('boxesOverlap', () => {
  test('separated boxes do not overlap', () => {
    expect(entrancePicker.boxesOverlap(box(0, 0, 10, 10), box(20, 0, 30, 10))).toBe(false);
    expect(entrancePicker.boxesOverlap(box(0, 0, 10, 10), box(0, 20, 10, 30))).toBe(false);
  });

  test('boxes flush against each other are not overlapping', () => {
    // Labels may sit edge to edge; only real overlap makes them unreadable.
    expect(entrancePicker.boxesOverlap(box(0, 0, 10, 10), box(10, 0, 20, 10))).toBe(false);
  });

  test('boxes sharing any area overlap', () => {
    expect(entrancePicker.boxesOverlap(box(0, 0, 10, 10), box(9, 9, 20, 20))).toBe(true);
    // One entirely inside another.
    expect(entrancePicker.boxesOverlap(box(0, 0, 30, 30), box(5, 5, 10, 10))).toBe(true);
  });
});

describe('clusterOverlappingLabels', () => {
  test('labels that all fit stay one per group', () => {
    const groups = entrancePicker.clusterOverlappingLabels([
      box(0, 0, 10, 10), box(50, 0, 60, 10), box(100, 0, 110, 10)
    ]);
    expect(groups).toEqual([[0], [1], [2]]);
  });

  test('a colliding pair becomes one group', () => {
    const groups = entrancePicker.clusterOverlappingLabels([
      box(0, 0, 10, 10), box(5, 5, 15, 15), box(100, 0, 110, 10)
    ]);
    expect(groups).toEqual([[0, 1], [2]]);
  });

  test('overlap carries along a chain', () => {
    // A overlaps B and B overlaps C, but A and C are clear. Showing A and C
    // while hiding B would be arbitrary, so the run collapses together.
    const groups = entrancePicker.clusterOverlappingLabels([
      box(0, 0, 10, 10), box(8, 0, 18, 10), box(16, 0, 26, 10)
    ]);
    expect(groups).toEqual([[0, 1, 2]]);
  });

  test('keeps the original order, of groups and within them', () => {
    const groups = entrancePicker.clusterOverlappingLabels([
      box(100, 0, 110, 10), box(0, 0, 10, 10), box(5, 5, 15, 15)
    ]);
    expect(groups).toEqual([[0], [1, 2]]);
  });

  test('everything on top of everything is a single group', () => {
    const groups = entrancePicker.clusterOverlappingLabels([
      box(0, 0, 20, 20), box(1, 1, 21, 21), box(2, 2, 22, 22), box(3, 3, 23, 23)
    ]);
    expect(groups).toEqual([[0, 1, 2, 3]]);
  });

  test('tolerates nothing to place', () => {
    expect(entrancePicker.clusterOverlappingLabels([])).toEqual([]);
    expect(entrancePicker.clusterOverlappingLabels(null)).toEqual([]);
    expect(entrancePicker.clusterOverlappingLabels([box(0, 0, 5, 5)])).toEqual([[0]]);
  });
});

describe('allowsMode', () => {
  const door = (tags) => ({ osmId: 1, type: 'main', center: { lat: 1, lng: 1 }, tags });

  test('a door with nothing to say is usable by everyone', () => {
    expect(entrancePicker.allowsMode(door(undefined), 'foot')).toBe(true);
    expect(entrancePicker.allowsMode(door({}), 'driving')).toBe(true);
  });

  test('access=private or no shuts every mode out', () => {
    ['foot', 'bike', 'driving'].forEach((mode) => {
      expect(entrancePicker.allowsMode(door({ access: 'private' }), mode)).toBe(false);
      expect(entrancePicker.allowsMode(door({ access: 'no' }), mode)).toBe(false);
    });
  });

  test('permissive, customers and designated are all usable', () => {
    ['permissive', 'customers', 'designated', 'destination', 'yes'].forEach((v) => {
      expect(entrancePicker.allowsMode(door({ access: v }), 'foot')).toBe(true);
    });
  });

  test('the mode-specific key beats the general one, in both directions', () => {
    // A door closed in general but explicitly opened to pedestrians.
    expect(entrancePicker.allowsMode(door({ access: 'no', foot: 'yes' }), 'foot')).toBe(true);
    // ...and one open in general but closed to them.
    expect(entrancePicker.allowsMode(door({ access: 'yes', foot: 'no' }), 'foot')).toBe(false);
  });

  test('vehicle sits between the specific key and access for wheeled modes', () => {
    expect(entrancePicker.allowsMode(door({ access: 'yes', vehicle: 'no' }), 'bike')).toBe(false);
    expect(entrancePicker.allowsMode(door({ access: 'yes', vehicle: 'no' }), 'driving')).toBe(false);
    // ...but says nothing about walking.
    expect(entrancePicker.allowsMode(door({ access: 'yes', vehicle: 'no' }), 'foot')).toBe(true);
    // The more specific key still wins over it.
    expect(entrancePicker.allowsMode(door({ vehicle: 'no', bicycle: 'yes' }), 'bike')).toBe(true);
  });

  test('a service entrance for deliveries is closed to cars but open on foot', () => {
    const d = door({ motor_vehicle: 'no', foot: 'yes' });
    expect(entrancePicker.allowsMode(d, 'driving')).toBe(false);
    expect(entrancePicker.allowsMode(d, 'foot')).toBe(true);
  });

  test('an unrecognised value is not read as a prohibition', () => {
    expect(entrancePicker.allowsMode(door({ access: 'unknown_value' }), 'foot')).toBe(true);
  });

  test('values are matched case-insensitively', () => {
    expect(entrancePicker.allowsMode(door({ access: 'No' }), 'foot')).toBe(false);
    expect(entrancePicker.allowsMode(door({ access: 'PRIVATE' }), 'foot')).toBe(false);
  });

  test('no mode, or one we have no rules for, filters nothing', () => {
    expect(entrancePicker.allowsMode(door({ access: 'no' }), undefined)).toBe(true);
    expect(entrancePicker.allowsMode(door({ access: 'no' }), 'hovercraft')).toBe(true);
  });

  test('both spellings of each wheeled mode are understood', () => {
    const d = door({ motor_vehicle: 'no' });
    expect(entrancePicker.allowsMode(d, 'driving')).toBe(false);
    expect(entrancePicker.allowsMode(d, 'car')).toBe(false);
    const b = door({ bicycle: 'no' });
    expect(entrancePicker.allowsMode(b, 'bike')).toBe(false);
    expect(entrancePicker.allowsMode(b, 'bicycle')).toBe(false);
  });
});

describe('routableEntrances with a mode', () => {
  const open = { osmId: 1, type: 'main', center: { lat: 1, lng: 1 } };
  const noCars = { osmId: 2, type: 'yes', center: { lat: 2, lng: 2 }, tags: { motor_vehicle: 'no' } };
  const priv = { osmId: 3, type: 'yes', center: { lat: 3, lng: 3 }, tags: { access: 'private' } };
  const all = [open, noCars, priv];
  const ids = (mode) => entrancePicker.routableEntrances(all, 'destination', mode).map((e) => e.osmId);

  test('drops the doors the mode forbids', () => {
    expect(ids('driving')).toEqual([1]);
    expect(ids('foot')).toEqual([1, 2]);
  });

  test('applies the direction and the access rules together', () => {
    const exitNoCars = {
      osmId: 4, type: 'exit', center: { lat: 4, lng: 4 }, tags: { motor_vehicle: 'no' }
    };
    const set = [open, exitNoCars];
    // Forbidden to cars, and an exit is no use as a destination anyway.
    expect(entrancePicker.routableEntrances(set, 'destination', 'driving').map((e) => e.osmId))
      .toEqual([1]);
    // Right direction for an origin, but still forbidden to cars.
    expect(entrancePicker.routableEntrances(set, 'origin', 'driving').map((e) => e.osmId))
      .toEqual([1]);
    // Right direction and allowed on foot.
    expect(entrancePicker.routableEntrances(set, 'origin', 'foot').map((e) => e.osmId))
      .toEqual([1, 4]);
  });

  test('omitting the mode applies no access filtering at all', () => {
    expect(entrancePicker.routableEntrances(all, 'destination').map((e) => e.osmId))
      .toEqual([1, 2, 3]);
  });
});

describe('waypointRole', () => {
  test('names each end of the route', () => {
    expect(entrancePicker.waypointRole(0, 2)).toBe('origin');
    expect(entrancePicker.waypointRole(1, 2)).toBe('destination');
  });

  test('anything in between is a via point', () => {
    expect(entrancePicker.waypointRole(1, 3)).toBe('via');
    expect(entrancePicker.waypointRole(2, 4)).toBe('via');
  });
});

describe('no automatic selection', () => {
  test('the module exposes no way to pick an entrance for the user', () => {
    expect(entrancePicker.selectPrimaryEntrance).toBeUndefined();
  });

  test('a lone main entrance is still only offered, never applied', () => {
    const choices = entrancePicker.buildChoices(
      { lat: 52.5209336, lng: 13.3956302 }, PERGAMON);
    // Both doors, and nothing marked as already chosen.
    expect(choices.map((c) => c.kind)).toEqual(['main', 'other']);
    expect(choices.every((c) => c.selected === undefined)).toBe(true);
  });
});

describe('buildChoices', () => {
  const centre = { lat: 52.3657974, lng: 13.4888906 };

  test('offers the doors and nothing else', () => {
    // The place centre is not a dot: the waypoint's pin never leaves it.
    const choices = entrancePicker.buildChoices(centre, PERGAMON);
    expect(choices.map((c) => c.id)).toEqual(['osm:1', 'osm:2']);
    expect(choices.map((c) => c.kind)).toEqual(['main', 'other']);
  });

  test('every choice keeps its entrance, so a click knows which door it was', () => {
    const choices = entrancePicker.buildChoices(centre, PERGAMON);
    expect(choices[0].entrance).toBe(PERGAMON[0]);
    expect(choices[1].entrance).toBe(PERGAMON[1]);
  });

  test('a place with a single door still yields one choice', () => {
    expect(entrancePicker.buildChoices(centre, [PERGAMON[0]])).toHaveLength(1);
  });

  test('drops anything without coordinates', () => {
    expect(entrancePicker.buildChoices(centre, [{ osmId: 9, type: 'main' }])).toEqual([]);
  });
});

describe('choicePoints', () => {
  const centre = { lat: 52.3657974, lng: 13.4888906 };

  test('includes the place centre, where the pin stays', () => {
    const points = entrancePicker.choicePoints(
      entrancePicker.buildChoices(centre, PERGAMON), centre);
    expect(points).toHaveLength(3);
    expect(points).toContain(centre);
  });

  test('omits it when there is none to include', () => {
    expect(entrancePicker.choicePoints(
      entrancePicker.buildChoices(centre, PERGAMON), null)).toHaveLength(2);
  });
});

describe('isExtentClear', () => {
  const mapSize = { x: 1400, y: 800 };

  test('an extent inside the uncovered part of the map is clear', () => {
    expect(entrancePicker.isExtentClear({ x: 100, y: 700 }, { x: 900, y: 100 }, mapSize, 380)).toBe(true);
  });

  test('an extent reaching under the directions pane is not clear', () => {
    expect(entrancePicker.isExtentClear({ x: 100, y: 700 }, { x: 1100, y: 100 }, mapSize, 380)).toBe(false);
  });

  test('the same extent is clear once the pane is hidden', () => {
    expect(entrancePicker.isExtentClear({ x: 100, y: 700 }, { x: 1100, y: 100 }, mapSize, 0)).toBe(true);
  });

  test('an extent running off the top or left is not clear', () => {
    expect(entrancePicker.isExtentClear({ x: -40, y: 700 }, { x: 900, y: 100 }, mapSize, 380)).toBe(false);
    expect(entrancePicker.isExtentClear({ x: 100, y: 700 }, { x: 900, y: -20 }, mapSize, 380)).toBe(false);
  });
});

describe('shouldZoomToExtent', () => {
  const viewport = { width: 1000, height: 780 };
  const fills = (frac) => ({ width: viewport.width * frac, height: 10 });

  test('zooms when part of the area is off screen or under the pane', () => {
    expect(entrancePicker.shouldZoomToExtent(fills(0.9), viewport, false)).toBe(true);
  });

  test('zooms when the area is a small blob rather than framed', () => {
    // BER's 5 km bbox is ~120px wide at zoom 11 in a ~1000px free viewport.
    expect(entrancePicker.shouldZoomToExtent({ width: 122, height: 122 }, viewport, true)).toBe(true);
  });

  test('leaves the view alone once the area fills the free viewport', () => {
    expect(entrancePicker.shouldZoomToExtent(fills(0.8), viewport, true)).toBe(false);
  });

  test('either dimension filling the viewport is enough', () => {
    expect(entrancePicker.shouldZoomToExtent(
      { width: 10, height: viewport.height * 0.8 }, viewport, true)).toBe(false);
  });

  test('is measured against the free viewport, so a wide pane forces a zoom', () => {
    const extent = { width: 200, height: 200 };
    expect(entrancePicker.shouldZoomToExtent(extent, { width: 500, height: 500 }, true)).toBe(false);
    expect(entrancePicker.shouldZoomToExtent(extent, { width: 1200, height: 900 }, true)).toBe(true);
  });

  test('zooms rather than dividing by zero when the pane leaves no room', () => {
    expect(entrancePicker.shouldZoomToExtent(fills(0.8), { width: 0, height: 0 }, true)).toBe(true);
  });
});
