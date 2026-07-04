/** @jest-environment jsdom */

'use strict';

var resolveWaypointSlot = require('../src/waypoint_placement').resolveWaypointSlot;

function w(latLng) {
  return { latLng: latLng };
}

var start = w({ lat: 52.5, lng: 13.4 });
var dest = w({ lat: 48.2, lng: 16.4 });
var via = w({ lat: 50.0, lng: 14.5 });
var empty = w(null);

describe('resolveWaypointSlot', function () {
  // ── Basic happy paths ──────────────────────────────────────────────

  it('fills the first empty slot when start is empty and dest is set', function () {
    var waypoints = [empty, dest];
    var action = resolveWaypointSlot(waypoints, false);
    expect(action).toEqual({ index: 0, deleteCount: 1 });
  });

  it('fills the first empty slot when start is empty with via and dest set', function () {
    var waypoints = [empty, via, dest];
    var action = resolveWaypointSlot(waypoints, false);
    expect(action).toEqual({ index: 0, deleteCount: 1 });
  });

  it('returns null when source and dest are set even with a gap in between (preserves original behaviour)', function () {
    // [start, empty, dest] → source=set, target=set → "do not change existing markers"
    var waypoints = [start, empty, dest];
    var action = resolveWaypointSlot(waypoints, false);
    expect(action).toBeNull();
  });

  it('replaces the last slot when all slots are filled (no key pressed)', function () {
    var waypoints = [start];
    var action = resolveWaypointSlot(waypoints, false);
    expect(action).toEqual({ index: 0, deleteCount: 1 });
  });

  it('replaces the only empty slot', function () {
    var waypoints = [empty];
    var action = resolveWaypointSlot(waypoints, false);
    expect(action).toEqual({ index: 0, deleteCount: 1 });
  });

  // ── Source and target are set → early return ─────────────────────────

  it('returns null when source and target are set and no modifier', function () {
    var waypoints = [start, dest];
    var action = resolveWaypointSlot(waypoints, false);
    expect(action).toBeNull();
  });

  it('returns null when source, via, and target are all set and no modifier', function () {
    var waypoints = [start, via, dest];
    var action = resolveWaypointSlot(waypoints, false);
    expect(action).toBeNull();
  });

  // ── Modifier (Ctrl/Meta) → insert via-point ──────────────────────────

  it('inserts before last slot when source and target are set with modifier', function () {
    var waypoints = [start, dest];
    var action = resolveWaypointSlot(waypoints, true);
    expect(action).toEqual({ index: 1, deleteCount: 0 });
  });

  it('inserts before last slot with 3 waypoints and modifier (even when start is empty)', function () {
    // e.g. ?loc=&loc=<via>&loc=<dest> → [null, via, dest]
    // source is empty, so the old "length >= 2" check would fire — but
    // sourceAndTargetSet correctly sees waypoints[0].latLng is null.
    var waypoints = [empty, via, dest];
    var action = resolveWaypointSlot(waypoints, true);
    expect(action).toEqual({ index: 0, deleteCount: 1 });
  });

  it('inserts before last slot with 3 waypoints and modifier when all filled', function () {
    var waypoints = [start, via, dest];
    var action = resolveWaypointSlot(waypoints, true);
    expect(action).toEqual({ index: 2, deleteCount: 0 });
  });

  // ── Empty array safety ──────────────────────────────────────────────

  it('clamps to index 0 when waypoints is empty', function () {
    var action = resolveWaypointSlot([], false);
    expect(action).toEqual({ index: 0, deleteCount: 1 });
  });

  it('clamps to index 0 when waypoints is empty with modifier', function () {
    var action = resolveWaypointSlot([], true);
    expect(action).toEqual({ index: 0, deleteCount: 1 });
  });

  // ── Source-only edge cases ──────────────────────────────────────────

  it('replaces last when only source is filled (single waypoint)', function () {
    var waypoints = [start];
    var action = resolveWaypointSlot(waypoints, false);
    expect(action).toEqual({ index: 0, deleteCount: 1 });
  });

  it('fills empty last slot when only source is filled (two waypoints)', function () {
    var waypoints = [start, empty];
    var action = resolveWaypointSlot(waypoints, false);
    expect(action).toEqual({ index: 1, deleteCount: 1 });
  });

  // ── Null latLng in the middle ──────────────────────────────────────

  it('fills the first null when two waypoints are null', function () {
    var waypoints = [empty, empty];
    var action = resolveWaypointSlot(waypoints, false);
    expect(action).toEqual({ index: 0, deleteCount: 1 });
  });

  it('fills first empty even when later slots are filled', function () {
    var waypoints = [empty, start, dest];
    var action = resolveWaypointSlot(waypoints, false);
    expect(action).toEqual({ index: 0, deleteCount: 1 });
  });

  // ── Large arrays ───────────────────────────────────────────────────

  it('returns null when source and last are set even with gaps (many-waypoint array)', function () {
    // [start, empty, dest, empty, via] → source=set, last=set → return null
    var waypoints = [start, empty, dest, empty, via];
    var action = resolveWaypointSlot(waypoints, false);
    expect(action).toBeNull();
  });
});
