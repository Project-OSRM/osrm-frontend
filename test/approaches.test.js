'use strict';

const approaches = require('../src/approaches');

describe('approaches', () => {
  describe('normalizeApproach', () => {
    test('keeps the three known values', () => {
      expect(approaches.normalizeApproach('curb')).toBe('curb');
      expect(approaches.normalizeApproach('opposite')).toBe('opposite');
      expect(approaches.normalizeApproach('unrestricted')).toBe('unrestricted');
    });

    test('ignores case and surrounding whitespace', () => {
      expect(approaches.normalizeApproach(' CURB ')).toBe('curb');
    });

    test('treats anything else as unrestricted', () => {
      expect(approaches.normalizeApproach('left')).toBe('unrestricted');
      expect(approaches.normalizeApproach('')).toBe('unrestricted');
      expect(approaches.normalizeApproach(undefined)).toBe('unrestricted');
      expect(approaches.normalizeApproach(null)).toBe('unrestricted');
      expect(approaches.normalizeApproach(3)).toBe('unrestricted');
      expect(approaches.normalizeApproach({})).toBe('unrestricted');
    });
  });

  describe('nextApproach', () => {
    test('cycles unrestricted, curb, opposite and back', () => {
      expect(approaches.nextApproach('unrestricted')).toBe('curb');
      expect(approaches.nextApproach('curb')).toBe('opposite');
      expect(approaches.nextApproach('opposite')).toBe('unrestricted');
    });

    test('starts an unknown value from the default', () => {
      expect(approaches.nextApproach('nonsense')).toBe('curb');
      expect(approaches.nextApproach(undefined)).toBe('curb');
    });
  });

  describe('approachOf', () => {
    test('reads the value from the waypoint options', () => {
      expect(approaches.approachOf({ options: { approach: 'opposite' } })).toBe('opposite');
    });

    test('is unrestricted without options, without a waypoint, or with a bad value', () => {
      expect(approaches.approachOf({})).toBe('unrestricted');
      expect(approaches.approachOf({ options: {} })).toBe('unrestricted');
      expect(approaches.approachOf(null)).toBe('unrestricted');
      expect(approaches.approachOf({ options: { approach: 'x' } })).toBe('unrestricted');
    });
  });

  describe('setApproach', () => {
    test('stores the value in the options', () => {
      const waypoint = {};
      approaches.setApproach(waypoint, 'curb');
      expect(waypoint.options.approach).toBe('curb');
    });

    test('keeps the other options', () => {
      const waypoint = { options: { entrance: 'main', other: 1 } };
      approaches.setApproach(waypoint, 'opposite');
      expect(waypoint.options).toEqual({ entrance: 'main', other: 1, approach: 'opposite' });
    });

    test('does not modify an options object it was given', () => {
      const shared = { entrance: 'main' };
      const waypoint = { options: shared };
      approaches.setApproach(waypoint, 'curb');
      expect(shared).toEqual({ entrance: 'main' });
    });

    test('setting the default removes the key', () => {
      const waypoint = { options: { approach: 'curb', entrance: 'main' } };
      approaches.setApproach(waypoint, 'unrestricted');
      expect(waypoint.options).toEqual({ entrance: 'main' });
    });

    test('setting the default on a waypoint without options leaves it without options', () => {
      const waypoint = {};
      approaches.setApproach(waypoint, 'unrestricted');
      expect(waypoint.options).toBeUndefined();
    });

    test('normalizes the value it stores', () => {
      const waypoint = {};
      approaches.setApproach(waypoint, 'Curb');
      expect(waypoint.options.approach).toBe('curb');
      approaches.setApproach(waypoint, 'garbage');
      expect(approaches.approachOf(waypoint)).toBe('unrestricted');
    });

    test('tolerates a missing waypoint', () => {
      expect(approaches.setApproach(null, 'curb')).toBe(null);
    });
  });

  describe('formatApproaches', () => {
    const wp = (approach) => ({ options: approach ? { approach } : undefined });

    test('is undefined when no waypoint is restricted', () => {
      expect(approaches.formatApproaches([wp(), wp(), wp()])).toBeUndefined();
      expect(approaches.formatApproaches([])).toBeUndefined();
      expect(approaches.formatApproaches(undefined)).toBeUndefined();
    });

    test('joins one entry per waypoint, empty for unrestricted', () => {
      expect(approaches.formatApproaches([wp('curb'), wp(), wp('opposite')])).toBe('curb;;opposite');
      expect(approaches.formatApproaches([wp(), wp('curb')])).toBe(';curb');
      expect(approaches.formatApproaches([wp('curb'), wp()])).toBe('curb;');
    });

    test('an explicit unrestricted value is an empty entry', () => {
      expect(approaches.formatApproaches([wp('unrestricted'), wp('curb')])).toBe(';curb');
    });

    test('keeps one entry for a waypoint without a position', () => {
      expect(approaches.formatApproaches([wp('curb'), null, wp('opposite')])).toBe('curb;;opposite');
    });
  });

  describe('parseApproaches', () => {
    test('returns exactly count values', () => {
      expect(approaches.parseApproaches('curb;;opposite', 3)).toEqual(['curb', 'unrestricted', 'opposite']);
    });

    test('pads a short list with the default', () => {
      expect(approaches.parseApproaches('curb', 3)).toEqual(['curb', 'unrestricted', 'unrestricted']);
    });

    test('cuts a long list', () => {
      expect(approaches.parseApproaches('curb;curb;curb;curb', 2)).toEqual(['curb', 'curb']);
    });

    test('normalizes unknown entries', () => {
      expect(approaches.parseApproaches('curb;bogus', 2)).toEqual(['curb', 'unrestricted']);
    });

    test('treats a missing or non-string value as all default', () => {
      expect(approaches.parseApproaches(undefined, 2)).toEqual(['unrestricted', 'unrestricted']);
      expect(approaches.parseApproaches(['curb'], 1)).toEqual(['unrestricted']);
    });

    test('round-trips with formatApproaches', () => {
      const waypoints = [{ options: { approach: 'curb' } }, {}, { options: { approach: 'opposite' } }];
      const text = approaches.formatApproaches(waypoints);
      expect(approaches.parseApproaches(text, waypoints.length)).toEqual(['curb', 'unrestricted', 'opposite']);
    });
  });

  describe('applyApproaches', () => {
    test('sets each waypoint by position', () => {
      const waypoints = [{}, {}, {}];
      approaches.applyApproaches(waypoints, 'opposite;;curb');
      expect(waypoints.map(approaches.approachOf)).toEqual(['opposite', 'unrestricted', 'curb']);
    });

    test('clears a waypoint the text leaves unrestricted', () => {
      const waypoints = [{ options: { approach: 'curb' } }];
      approaches.applyApproaches(waypoints, '');
      expect(approaches.approachOf(waypoints[0])).toBe('unrestricted');
    });

    test('leaves a non-array alone', () => {
      expect(approaches.applyApproaches(undefined, 'curb')).toBeUndefined();
    });
  });
});
