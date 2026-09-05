/**
 * @jest-environment jsdom
 */

'use strict';

// A U-turn in left-hand traffic swings to the right, so the itinerary marks
// the row and the stylesheet mirrors the arrow (and swaps the lane glyph).
// The driving side comes from gauche-rs once it has loaded, and from the
// backend's driving_side until then.

const { createDrivingSideClassifier } = require('../src/driving_side');

const LEFT_HAND_TRAFFIC_CLASS = 'osrm-left-hand-traffic';
const LONDON = [-0.1278, 51.5074];   // [lng, lat], as OSRM reports locations
const BERLIN = [13.405, 52.52];

function fakeGauche() {
  return {
    init: () => Promise.resolve(),
    classifyPoint: (lat, lng) => {
      if (lat === LONDON[1] && lng === LONDON[0]) return 1;
      if (lat === BERLIN[1] && lng === BERLIN[0]) return 0;
      return -1;
    }
  };
}

function step(overrides) {
  return Object.assign({
    distance: 120,
    duration: 20,
    name: 'Whitehall',
    mode: 'driving',
    maneuver: { type: 'turn', modifier: 'uturn', location: LONDON, bearing_before: 0, bearing_after: 180 },
    intersections: [{ location: LONDON, entry: [true], bearings: [0] }]
  }, overrides);
}

function render(steps, classifier) {
  const Builder = require('../src/itinerary_builder')('en', classifier);
  const builder = new Builder();
  const container = builder.createContainer();
  const body = builder.createStepsContainer();
  container.appendChild(body);
  document.body.appendChild(container);
  const rows = steps.map(([osrmStep, icon]) => builder.createStep(osrmStep, '120 m', icon, body));
  return { builder, container, rows };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('U-turn rows', () => {
  test('a U-turn in left-hand traffic marks the row once gauche-rs has loaded', async () => {
    const classifier = createDrivingSideClassifier(fakeGauche());
    await classifier.load();
    const { rows } = render([[step(), 'u-turn']], classifier);
    expect(rows[0].classList.contains(LEFT_HAND_TRAFFIC_CLASS)).toBe(true);
    expect(rows[0].querySelector('.leaflet-routing-icon').className)
      .toBe('leaflet-routing-icon leaflet-routing-icon-u-turn');
  });

  test('a U-turn in right-hand traffic leaves the row unmarked', async () => {
    const classifier = createDrivingSideClassifier(fakeGauche());
    await classifier.load();
    const berlin = step({ maneuver: { type: 'turn', modifier: 'uturn', location: BERLIN } });
    const { rows } = render([[berlin, 'u-turn']], classifier);
    expect(rows[0].classList.contains(LEFT_HAND_TRAFFIC_CLASS)).toBe(false);
  });

  test('gauche-rs wins over the driving_side the backend reports', async () => {
    const classifier = createDrivingSideClassifier(fakeGauche());
    await classifier.load();
    const { rows } = render([[step({ driving_side: 'right' }), 'u-turn']], classifier);
    expect(rows[0].classList.contains(LEFT_HAND_TRAFFIC_CLASS)).toBe(true);
  });

  test('the backend driving_side stands in while gauche-rs is loading', () => {
    const classifier = createDrivingSideClassifier(fakeGauche());
    const { rows } = render([
      [step({ driving_side: 'left' }), 'u-turn'],
      [step({ driving_side: 'right' }), 'u-turn'],
      [step(), 'u-turn']
    ], classifier);
    expect(rows[0].classList.contains(LEFT_HAND_TRAFFIC_CLASS)).toBe(true);
    expect(rows[1].classList.contains(LEFT_HAND_TRAFFIC_CLASS)).toBe(false);
    expect(rows[2].classList.contains(LEFT_HAND_TRAFFIC_CLASS)).toBe(false);
  });

  test('works without a classifier, from the backend driving_side alone', () => {
    const { rows } = render([[step({ driving_side: 'left' }), 'u-turn']]);
    expect(rows[0].classList.contains(LEFT_HAND_TRAFFIC_CLASS)).toBe(true);
  });

  test('other maneuvers are neither marked nor remembered for refresh', async () => {
    const classifier = createDrivingSideClassifier(fakeGauche());
    await classifier.load();
    const left = step({ maneuver: { type: 'turn', modifier: 'left', location: LONDON } });
    const { rows } = render([[left, 'turn-left']], classifier);
    expect(rows[0].classList.contains(LEFT_HAND_TRAFFIC_CLASS)).toBe(false);
    expect(rows[0].hasAttribute('data-maneuver-location')).toBe(false);
  });
});

describe('refreshDrivingSide', () => {
  test('classifies rows drawn before gauche-rs loaded', async () => {
    const classifier = createDrivingSideClassifier(fakeGauche());
    const berlin = step({ maneuver: { type: 'turn', modifier: 'uturn', location: BERLIN }, driving_side: 'left' });
    const { builder, container, rows } = render([
      [step(), 'u-turn'],   // London without a backend driving_side: unknown so far
      [berlin, 'u-turn']    // backend says left, gauche-rs will say right
    ], classifier);
    expect(rows[0].classList.contains(LEFT_HAND_TRAFFIC_CLASS)).toBe(false);
    expect(rows[1].classList.contains(LEFT_HAND_TRAFFIC_CLASS)).toBe(true);

    await classifier.load();
    builder.refreshDrivingSide(container);

    expect(rows[0].classList.contains(LEFT_HAND_TRAFFIC_CLASS)).toBe(true);
    expect(rows[1].classList.contains(LEFT_HAND_TRAFFIC_CLASS)).toBe(false);
  });

  test('keeps the fallback where gauche-rs has no answer', async () => {
    const classifier = createDrivingSideClassifier(fakeGauche());
    const unknown = step({ maneuver: { type: 'turn', modifier: 'uturn', location: [0, 0] }, driving_side: 'left' });
    const { builder, container, rows } = render([[unknown, 'u-turn']], classifier);
    await classifier.load();
    builder.refreshDrivingSide(container);
    expect(rows[0].classList.contains(LEFT_HAND_TRAFFIC_CLASS)).toBe(true);
  });

  test('does nothing before gauche-rs has loaded or without a classifier', () => {
    const classifier = createDrivingSideClassifier(fakeGauche());
    const { builder, container, rows } = render([[step(), 'u-turn']], classifier);
    builder.refreshDrivingSide(container);
    expect(rows[0].classList.contains(LEFT_HAND_TRAFFIC_CLASS)).toBe(false);

    const bare = render([[step(), 'u-turn']]);
    expect(() => bare.builder.refreshDrivingSide(bare.container)).not.toThrow();
  });
});

describe('U-turn lanes', () => {
  function stepWithUturnLane(location) {
    return step({
      maneuver: { type: 'turn', modifier: 'left', location: location },
      intersections: [{
        location: location,
        entry: [true],
        bearings: [0],
        lanes: [
          { valid: true, indications: ['uturn'] },
          { valid: true, indications: ['left'] },
          { valid: false, indications: ['straight'] }
        ]
      }]
    });
  }

  test('a lane allowing a U-turn marks the row in left-hand traffic', async () => {
    const classifier = createDrivingSideClassifier(fakeGauche());
    await classifier.load();
    const { rows } = render([[stepWithUturnLane(LONDON), 'turn-left']], classifier);
    expect(rows[0].classList.contains(LEFT_HAND_TRAFFIC_CLASS)).toBe(true);
    const laneIcons = rows[0].querySelectorAll('.osrm-lane-icon');
    expect(laneIcons[0].classList.contains('uturn')).toBe(true);
    expect(laneIcons[1].classList.contains('left')).toBe(true);
  });

  test('and leaves it unmarked in right-hand traffic', async () => {
    const classifier = createDrivingSideClassifier(fakeGauche());
    await classifier.load();
    const { rows } = render([[stepWithUturnLane(BERLIN), 'turn-left']], classifier);
    expect(rows[0].classList.contains(LEFT_HAND_TRAFFIC_CLASS)).toBe(false);
    expect(rows[0].querySelector('.osrm-lane-icon').classList.contains('uturn')).toBe(true);
  });
});
