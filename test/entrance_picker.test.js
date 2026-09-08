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
 * The picker's pure helpers: which doors may be offered at which end of a
 * route, what a door is called, and what gets framed. The half that talks to
 * Leaflet is covered in entrance_picker_instance.test.js.
 */

const picker = require('../src/entrance_picker');

const at = (lat, lng) => ({ lat, lng });
const door = (type, extra) => Object.assign(
  { osmId: 1, type, center: at(52.52, 13.4) }, extra);

describe('which doors are routable', () => {
  // From the wiki's own definitions: entrance=exit is "a one-way out of a
  // building", entrance=entrance "an entrance only, a one-way in".
  test('a one-way exit can be left through but not entered', () => {
    const exit = [door('exit')];
    expect(picker.routableEntrances(exit, 'origin')).toEqual(exit);
    expect(picker.routableEntrances(exit, 'destination')).toEqual([]);
  });

  test('a one-way entrance can be entered but not left through', () => {
    const entrance = [door('entrance')];
    expect(picker.routableEntrances(entrance, 'destination')).toEqual(entrance);
    expect(picker.routableEntrances(entrance, 'origin')).toEqual([]);
  });

  test('a via point is both arrived at and left from, so it takes neither', () => {
    expect(picker.routableEntrances([door('exit'), door('entrance')], 'via')).toEqual([]);
  });

  test('the two-way values are offered at every end', () => {
    const types = ['main', 'yes', 'secondary', 'shop', 'home', 'staircase'];
    const doors = types.map((t) => door(t));
    ['origin', 'destination', 'via'].forEach((role) => {
      expect(picker.routableEntrances(doors, role)).toHaveLength(types.length);
    });
  });

  // entrance=staircase is the door of a stairwell — how residents of an
  // apartment building get in — and belongs with home, not with the interior
  // doors. It is the third most common value after yes and main.
  test('a staircase door is a way in, not an interior door', () => {
    expect(picker.routableEntrances([door('staircase')], 'destination')).toHaveLength(1);
  });

  test('doors that are nobody\'s way in are never offered', () => {
    const shut = ['service', 'emergency', 'garage', 'no'].map((t) => door(t));
    ['origin', 'destination', 'via'].forEach((role) => {
      expect(picker.routableEntrances(shut, role)).toEqual([]);
    });
  });

  test('an unknown value is not guessed at', () => {
    expect(picker.routableEntrances([door('something_new')], 'origin')).toEqual([]);
  });

  test('a door without coordinates cannot be routed to', () => {
    expect(picker.routableEntrances([door('main', { center: null })], 'origin')).toEqual([]);
  });

  test('no role means the strictest reading, and no list means no doors', () => {
    expect(picker.routableEntrances([door('exit')])).toEqual([]);
    expect(picker.routableEntrances(null, 'origin')).toEqual([]);
    expect(picker.routableEntrances(undefined)).toEqual([]);
  });
});

describe('waypointRole', () => {
  test('reads the ends of the route, and everything between as a via', () => {
    expect(picker.waypointRole(0, 3)).toBe('origin');
    expect(picker.waypointRole(1, 3)).toBe('via');
    expect(picker.waypointRole(2, 3)).toBe('destination');
  });

  test('the first of two is the origin and the second the destination', () => {
    expect(picker.waypointRole(0, 2)).toBe('origin');
    expect(picker.waypointRole(1, 2)).toBe('destination');
  });
});

describe('entranceName', () => {
  // Most doors have none, which is why the picker is a map and not a list —
  // but a door that names itself is named better than this app could manage.
  test('takes the name OSM gives the door', () => {
    expect(picker.entranceName(door('main', { tags: { name: 'Haupteingang Alexanderplatz' } })))
      .toBe('Haupteingang Alexanderplatz');
  });

  test('falls back to a ref for doors numbered rather than named', () => {
    expect(picker.entranceName(door('yes', { tags: { ref: 'C' } }))).toBe('C');
  });

  test('an unnamed, untagged or blank-named door has no name', () => {
    expect(picker.entranceName(door('yes'))).toBeNull();
    expect(picker.entranceName(door('yes', { tags: {} }))).toBeNull();
    expect(picker.entranceName(door('yes', { tags: { name: '   ' } }))).toBeNull();
    expect(picker.entranceName(null)).toBeNull();
  });

  test('a name that is not a string is not a name', () => {
    expect(picker.entranceName(door('yes', { tags: { name: 42 } }))).toBeNull();
  });
});

describe('buildChoices', () => {
  const main = door('main', { osmId: 11 });
  const side = door('yes', { osmId: 22, center: at(52.521, 13.401) });

  test('one choice per door, identified by its OSM node', () => {
    const choices = picker.buildChoices(at(52.5, 13.4), [main, side]);
    expect(choices.map((c) => c.id)).toEqual(['osm:11', 'osm:22']);
    expect(choices.map((c) => c.center)).toEqual([main.center, side.center]);
    expect(choices.map((c) => c.entrance)).toEqual([main, side]);
  });

  test('a main door is marked as one, so it can be drawn differently', () => {
    expect(picker.buildChoices(at(52.5, 13.4), [main, side]).map((c) => c.kind))
      .toEqual(['main', 'other']);
  });

  // The place centre is not among the choices: the waypoint's own pin never
  // leaves it, and clicking the chosen door again is what routes back to it.
  test('the place centre is not offered as a choice of its own', () => {
    const centre = at(52.5, 13.4);
    expect(picker.buildChoices(centre, [main]).map((c) => c.center)).toEqual([main.center]);
  });

  test('a door without a position is dropped rather than drawn at nowhere', () => {
    expect(picker.buildChoices(at(52.5, 13.4), [main, door('yes', { center: null })]))
      .toHaveLength(1);
    expect(picker.buildChoices(at(52.5, 13.4), null)).toEqual([]);
  });
});

describe('choicePoints', () => {
  test('frames the doors together with the pin that stays on the place', () => {
    const centre = at(52.5, 13.4);
    const choices = picker.buildChoices(centre, [door('main'), door('yes', { osmId: 2 })]);
    expect(picker.choicePoints(choices, centre)).toHaveLength(3);
    expect(picker.choicePoints(choices, centre)[2]).toBe(centre);
  });

  test('a place with no centre is framed on its doors alone', () => {
    const choices = picker.buildChoices(null, [door('main')]);
    expect(picker.choicePoints(choices, null)).toHaveLength(1);
  });
});

describe('boxesOverlap', () => {
  const box = (l, t, r, b) => ({ left: l, top: t, right: r, bottom: b });

  test('boxes that share area overlap', () => {
    expect(picker.boxesOverlap(box(0, 0, 40, 16), box(20, 0, 60, 16))).toBe(true);
  });

  test('boxes clear of each other do not', () => {
    expect(picker.boxesOverlap(box(0, 0, 40, 16), box(100, 0, 140, 16))).toBe(false);
    expect(picker.boxesOverlap(box(0, 0, 40, 16), box(0, 20, 40, 36))).toBe(false);
  });

  // Labels may sit flush against each other; only real overlap hides a name.
  test('boxes touching edge to edge are not overlapping', () => {
    expect(picker.boxesOverlap(box(0, 0, 40, 16), box(40, 0, 80, 16))).toBe(false);
    expect(picker.boxesOverlap(box(0, 0, 40, 16), box(0, 16, 40, 32))).toBe(false);
  });
});

describe('clusterOverlappingLabels', () => {
  const box = (l, r) => ({ left: l, top: 0, right: r, bottom: 16 });

  test('labels that all fit stay one to a door', () => {
    const groups = picker.clusterOverlappingLabels([box(0, 40), box(100, 140), box(200, 240)]);
    expect(groups).toEqual([[0], [1], [2]]);
  });

  test('a colliding pair becomes one group', () => {
    expect(picker.clusterOverlappingLabels([box(0, 40), box(20, 60), box(200, 240)]))
      .toEqual([[0, 1], [2]]);
  });

  // Showing A and C while hiding B would be arbitrary, so the whole run goes.
  test('overlap is transitive: a run collapses even where its ends are clear', () => {
    const groups = picker.clusterOverlappingLabels([box(0, 40), box(30, 70), box(60, 100)]);
    expect(picker.boxesOverlap(box(0, 40), box(60, 100))).toBe(false);
    expect(groups).toEqual([[0, 1, 2]]);
  });

  test('groups and their members keep the order the doors came in', () => {
    expect(picker.clusterOverlappingLabels([box(200, 240), box(0, 40), box(20, 60)]))
      .toEqual([[0], [1, 2]]);
  });

  test('nothing to lay out is not an error', () => {
    expect(picker.clusterOverlappingLabels([])).toEqual([]);
    expect(picker.clusterOverlappingLabels(null)).toEqual([]);
  });
});

describe('access by travel mode', () => {
  const tagged = (tags) => door('main', { tags });

  // Absence of a tag is not a prohibition: most doors say nothing at all.
  test('a door with nothing to say is open to everyone', () => {
    expect(picker.allowsMode(door('main'), 'driving')).toBe(true);
    expect(picker.allowsMode(tagged({}), 'foot')).toBe(true);
  });

  test('no mode, or a mode with no rules, filters nothing', () => {
    expect(picker.allowsMode(tagged({ access: 'no' }))).toBe(true);
    expect(picker.allowsMode(tagged({ access: 'no' }), 'hovercraft')).toBe(true);
  });

  test('only no and private forbid', () => {
    ['no', 'private'].forEach((value) => {
      expect(picker.allowsMode(tagged({ access: value }), 'foot')).toBe(false);
    });
    // Somebody routing to a shop's door is the customer it is tagged for.
    ['yes', 'permissive', 'designated', 'destination', 'customers', 'permit']
      .forEach((value) => {
        expect(picker.allowsMode(tagged({ access: value }), 'foot')).toBe(true);
      });
  });

  test('an unrecognised value is not read as a prohibition', () => {
    expect(picker.allowsMode(tagged({ access: 'seasonal' }), 'foot')).toBe(true);
  });

  test('the case of the value does not matter', () => {
    expect(picker.allowsMode(tagged({ access: 'No' }), 'foot')).toBe(false);
  });

  // OSM's own hierarchy: the most specific key present wins outright.
  test('the most specific key present settles it', () => {
    expect(picker.allowsMode(tagged({ access: 'no', foot: 'yes' }), 'foot')).toBe(true);
    expect(picker.allowsMode(tagged({ access: 'yes', foot: 'no' }), 'foot')).toBe(false);
    expect(picker.allowsMode(tagged({ vehicle: 'no', motor_vehicle: 'yes' }), 'driving'))
      .toBe(true);
    expect(picker.allowsMode(tagged({ access: 'yes', vehicle: 'no' }), 'bike')).toBe(false);
  });

  test('each mode reads its own keys and ignores the others', () => {
    const carsOnly = tagged({ foot: 'no' });
    expect(picker.allowsMode(carsOnly, 'foot')).toBe(false);
    expect(picker.allowsMode(carsOnly, 'driving')).toBe(true);
    expect(picker.allowsMode(carsOnly, 'bike')).toBe(true);
  });

  test('the profile aliases agree with each other', () => {
    const shut = tagged({ motor_vehicle: 'no' });
    expect(picker.allowsMode(shut, 'driving')).toBe(picker.allowsMode(shut, 'car'));
    const bikes = tagged({ bicycle: 'no' });
    expect(picker.allowsMode(bikes, 'bike')).toBe(picker.allowsMode(bikes, 'bicycle'));
  });

  test('routableEntrances applies the mode on top of the direction', () => {
    const open = door('main', { osmId: 1 });
    const noCars = door('main', { osmId: 2, tags: { motor_vehicle: 'no' } });
    expect(picker.routableEntrances([open, noCars], 'origin', 'driving')).toEqual([open]);
    expect(picker.routableEntrances([open, noCars], 'origin', 'foot'))
      .toEqual([open, noCars]);
    // Omitted, nothing is filtered on access at all.
    expect(picker.routableEntrances([open, noCars], 'origin')).toEqual([open, noCars]);
  });
});

describe('marks', () => {
  const tagged = (tags) => door('main', { tags });

  test('a step-free door is marked on foot, and nowhere else', () => {
    const wide = tagged({ wheelchair: 'yes' });
    expect(picker.entranceMark(wide, 'foot').label).toBe('Wheelchair accessible');
    expect(picker.entranceMark(wide, 'driving')).toBeNull();
    expect(picker.entranceMark(wide, 'bike')).toBeNull();
  });

  test('designated counts as step-free, limited does not', () => {
    expect(picker.entranceMark(tagged({ wheelchair: 'designated' }), 'foot')).toBeTruthy();
    // "Limited" means passable only with help, or on terms the tag never spells
    // out; promising step-free access there is worse than saying nothing.
    expect(picker.entranceMark(tagged({ wheelchair: 'limited' }), 'foot')).toBeNull();
    expect(picker.entranceMark(tagged({ wheelchair: 'no' }), 'foot')).toBeNull();
  });

  test('a parking entrance is marked when driving, and nowhere else', () => {
    const gate = tagged({ amenity: 'parking_entrance' });
    expect(picker.entranceMark(gate, 'driving').label).toBe('Parking entrance');
    expect(picker.entranceMark(gate, 'car').label).toBe('Parking entrance');
    expect(picker.entranceMark(gate, 'foot')).toBeNull();
  });

  test('cycling has no mark of its own, and neither has no mode at all', () => {
    const both = tagged({ wheelchair: 'yes', amenity: 'parking_entrance' });
    expect(picker.entranceMark(both, 'bike')).toBeNull();
    expect(picker.entranceMark(both)).toBeNull();
  });

  test('an untagged door earns nothing', () => {
    expect(picker.entranceMark(door('main'), 'foot')).toBeNull();
    expect(picker.entranceMark(null, 'foot')).toBeNull();
  });

  // A mark never filters: an absent tag means nobody surveyed the door.
  test('a mark says nothing about whether the door is offered', () => {
    const plain = door('main', { osmId: 1 });
    const marked = door('main', { osmId: 2, tags: { wheelchair: 'yes' } });
    expect(picker.routableEntrances([plain, marked], 'origin', 'foot'))
      .toEqual([plain, marked]);
  });
});
