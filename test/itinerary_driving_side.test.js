/**
 * @jest-environment jsdom
 */
'use strict';

const ItineraryBuilder = require('../src/itinerary_builder')('en');

function renderStep(drivingSide, icon) {
  const builder = new ItineraryBuilder();
  return builder.createStep({
    maneuver: { type: 'turn', modifier: 'uturn' },
    driving_side: drivingSide,
    distance: 10,
    duration: 5,
    mode: 'driving',
    name: 'Main Street',
    intersections: [{
      location: [13.4, 52.5],
      entry: [true],
      bearings: [0],
      lanes: [{ valid: true, indications: ['uturn'] }]
    }]
  }, '10 m', icon, builder.createStepsContainer());
}

describe('U-turn driving side (issue #189)', () => {
  test('mirrors the maneuver and uses the right-turning lane arrow for left-hand traffic', () => {
    const row = renderStep('left', 'u-turn');
    expect(row.querySelector('.leaflet-routing-icon').style.transform).toBe('scaleX(-1)');
    expect(row.querySelector('.osrm-lane-icon').classList.contains('uturn-right')).toBe(true);
  });

  test.each(['right', undefined])('keeps the default arrows for driving side %s', (side) => {
    const row = renderStep(side, 'u-turn');
    expect(row.querySelector('.leaflet-routing-icon').style.transform).toBe('');
    expect(row.querySelector('.osrm-lane-icon').classList.contains('uturn')).toBe(true);
  });

  test('does not mirror other maneuver icons in left-hand traffic', () => {
    expect(renderStep('left', 'turn-left').querySelector('.leaflet-routing-icon').style.transform).toBe('');
  });
});
