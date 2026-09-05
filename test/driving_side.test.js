'use strict';

const {
  createDrivingSideClassifier,
  stepDrivingSide
} = require('../src/driving_side');

// A stand-in for the gauche-rs module: init() resolves, and classifyPoint
// answers from a table keyed by "lat,lng" with gauche-rs' own return values
// (0 right-hand traffic, 1 left-hand traffic, -1 invalid input).
function fakeGauche(answers) {
  const gauche = {
    initCalls: 0,
    init: jest.fn(function() {
      gauche.initCalls++;
      return Promise.resolve();
    }),
    classifyPoint: jest.fn(function(lat, lng) {
      const key = lat + ',' + lng;
      return key in answers ? answers[key] : -1;
    })
  };
  return gauche;
}

const LONDON = { lat: 51.5074, lng: -0.1278 };
const BERLIN = { lat: 52.52, lng: 13.405 };
const ANSWERS = {
  '51.5074,-0.1278': 1,
  '52.52,13.405': 0
};

function uturnStep(latLng, drivingSide) {
  const step = {
    maneuver: { type: 'turn', modifier: 'uturn', location: [latLng.lng, latLng.lat] }
  };
  if (drivingSide) step.driving_side = drivingSide;
  return step;
}

describe('createDrivingSideClassifier', () => {
  test('answers nothing until the module has loaded', () => {
    const classifier = createDrivingSideClassifier(fakeGauche(ANSWERS));
    expect(classifier.isReady()).toBe(false);
    expect(classifier.classifyPoint(LONDON.lat, LONDON.lng)).toBeUndefined();
  });

  test('maps gauche-rs results to left and right once loaded', async () => {
    const classifier = createDrivingSideClassifier(fakeGauche(ANSWERS));
    await classifier.load();
    expect(classifier.isReady()).toBe(true);
    expect(classifier.classifyPoint(LONDON.lat, LONDON.lng)).toBe('left');
    expect(classifier.classifyPoint(BERLIN.lat, BERLIN.lng)).toBe('right');
  });

  test('leaves a location gauche-rs cannot classify undefined', async () => {
    const classifier = createDrivingSideClassifier(fakeGauche(ANSWERS));
    await classifier.load();
    expect(classifier.classifyPoint(0, 0)).toBeUndefined();
  });

  test('passes the WebAssembly URL on and loads only once', async () => {
    const gauche = fakeGauche(ANSWERS);
    const classifier = createDrivingSideClassifier(gauche);
    const first = classifier.load('gauche_rs.wasm');
    const second = classifier.load('gauche_rs.wasm');
    await Promise.all([first, second]);
    expect(first).toBe(second);
    expect(gauche.initCalls).toBe(1);
    expect(gauche.init).toHaveBeenCalledWith('gauche_rs.wasm');
  });

  test('stays not ready when loading fails', async () => {
    const gauche = fakeGauche(ANSWERS);
    gauche.init = () => Promise.reject(new Error('HTTP 404'));
    const classifier = createDrivingSideClassifier(gauche);
    await expect(classifier.load()).rejects.toThrow('HTTP 404');
    expect(classifier.isReady()).toBe(false);
    expect(classifier.classifyPoint(LONDON.lat, LONDON.lng)).toBeUndefined();
  });
});

describe('stepDrivingSide', () => {
  test('classifies the maneuver location with gauche-rs when it is loaded', async () => {
    const classifier = createDrivingSideClassifier(fakeGauche(ANSWERS));
    await classifier.load();
    expect(stepDrivingSide(uturnStep(LONDON), classifier)).toBe('left');
    expect(stepDrivingSide(uturnStep(BERLIN), classifier)).toBe('right');
  });

  test('prefers gauche-rs over the driving_side the backend reports', async () => {
    const classifier = createDrivingSideClassifier(fakeGauche(ANSWERS));
    await classifier.load();
    expect(stepDrivingSide(uturnStep(LONDON, 'right'), classifier)).toBe('left');
  });

  test('falls back to the driving_side the backend reports while loading', () => {
    const classifier = createDrivingSideClassifier(fakeGauche(ANSWERS));
    expect(stepDrivingSide(uturnStep(LONDON, 'left'), classifier)).toBe('left');
    expect(stepDrivingSide(uturnStep(BERLIN, 'right'), classifier)).toBe('right');
  });

  test('falls back to the driving_side when gauche-rs cannot classify the location', async () => {
    const classifier = createDrivingSideClassifier(fakeGauche(ANSWERS));
    await classifier.load();
    expect(stepDrivingSide(uturnStep({ lat: 0, lng: 0 }, 'left'), classifier)).toBe('left');
  });

  test('works without a classifier at all', () => {
    expect(stepDrivingSide(uturnStep(LONDON, 'left'))).toBe('left');
    expect(stepDrivingSide(uturnStep(LONDON))).toBeUndefined();
  });

  test('ignores a driving_side that is neither left nor right', () => {
    expect(stepDrivingSide(uturnStep(LONDON, 'both'))).toBeUndefined();
  });

  test('copes with steps that have no maneuver location', async () => {
    const classifier = createDrivingSideClassifier(fakeGauche(ANSWERS));
    await classifier.load();
    expect(stepDrivingSide({ maneuver: { type: 'turn' }, driving_side: 'left' }, classifier)).toBe('left');
    expect(stepDrivingSide(undefined, classifier)).toBeUndefined();
    expect(stepDrivingSide('Turn around', classifier)).toBeUndefined();
  });
});
