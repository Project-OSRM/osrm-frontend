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
