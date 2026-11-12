/**
 * @jest-environment jsdom
 */
'use strict';

// The approach toggle in each waypoint row: pressing it moves the waypoint on
// to its next approach and has the plan route again.

const approachControl = require('../src/approach_control');
const approaches = require('../src/approaches');
const reorder = require('../src/waypoint_reorder');
const marker = require('../src/waypoint_marker');

const TOGGLE = '.' + approachControl.TOGGLE_CLASS;

function rows(container) {
  return Array.from(container.querySelectorAll('.leaflet-routing-geocoder'));
}

function toggle(plan, i) {
  return rows(plan._geocoderContainer)[i].querySelector(TOGGLE);
}

function click(target) {
  target.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
}

function key(target, keyName) {
  const event = new window.KeyboardEvent('keydown', { key: keyName, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

function urlOf(element) {
  // Quoting of the url() differs between engines.
  return /url\(["']?([^"')]+)["']?\)/.exec(element.style.backgroundImage)[1];
}

// A plan that does what the real one does on setWaypoints: announces the change,
// rebuilds its rows and wires them again.
function fakePlan(count, language) {
  const plan = {
    options: { language: language || 'en' },
    _waypoints: Array.from({ length: count }, (_, i) => ({ name: 'wp' + i, latLng: { lat: i, lng: i } })),
    events: [],
    fire(type, data) {
      this.events.push({ type, data });
    },
    getWaypoints() {
      return this._waypoints.slice();
    },
    setWaypoints(waypoints) {
      this._waypoints = waypoints;
      this.fire('waypointschanged');
      this.rebuild();
    },
    rebuild() {
      if (this._geocoderContainer) this._geocoderContainer.remove();
      const container = document.createElement('div');
      document.body.appendChild(container);
      this._waypoints.forEach((wp, i) => {
        const row = reorder.createGeocoder(i, this._waypoints.length, { addWaypoints: true, language: this.options.language });
        row.input.value = wp.name;
        container.appendChild(row.container);
      });
      this._geocoderContainer = container;
      reorder.attachToPlan(this);
      approachControl.attachToPlan(this);
    },
    approachesNow() {
      return this._waypoints.map(approaches.approachOf);
    }
  };
  plan.rebuild();
  return plan;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('the toggle in a row', () => {
  test('is a focusable button between the input and the grip', () => {
    const row = reorder.createGeocoder(1, 3, { addWaypoints: true, language: 'en' });
    const button = row.container.querySelector(TOGGLE);
    expect(button.getAttribute('role')).toBe('button');
    expect(button.getAttribute('tabindex')).toBe('0');
    expect(button.previousElementSibling).toBe(row.input);
    expect(button.nextElementSibling.className).toBe(reorder.HANDLE_CLASS);
  });

  test('starts on the default', () => {
    const row = reorder.createGeocoder(0, 2, { addWaypoints: true, language: 'en' });
    expect(row.container.querySelector(TOGGLE).getAttribute('data-approach')).toBe('unrestricted');
  });

  test('is in the row when the plan cannot add waypoints', () => {
    const row = reorder.createGeocoder(0, 2, { addWaypoints: false, language: 'en' });
    expect(row.container.querySelector(TOGGLE)).not.toBeNull();
  });
});

describe('what a row shows', () => {
  test('every toggle shows its own waypoint\'s approach', () => {
    const plan = fakePlan(3);
    plan._waypoints[0].options = { approach: 'curb' };
    plan._waypoints[2].options = { approach: 'opposite' };
    plan.rebuild();
    expect([0, 1, 2].map(i => toggle(plan, i).getAttribute('data-approach')))
      .toEqual(['curb', 'unrestricted', 'opposite']);
  });

  test('says the approach in words', () => {
    const plan = fakePlan(2);
    plan._waypoints[1].options = { approach: 'opposite' };
    plan.rebuild();
    expect(toggle(plan, 0).getAttribute('aria-label')).toMatch(/any side/);
    expect(toggle(plan, 1).getAttribute('aria-label')).toMatch(/opposite side/);
    expect(toggle(plan, 1).getAttribute('title')).toBe(toggle(plan, 1).getAttribute('aria-label'));
  });

  test('the row\'s pin shows the approach the way the map\'s pin does', () => {
    const plan = fakePlan(3);
    plan._waypoints[1].options = { approach: 'curb' };
    plan.rebuild();
    const pinOf = i => rows(plan._geocoderContainer)[i].querySelector('.' + reorder.PIN_CLASS);
    expect(urlOf(pinOf(1))).toBe(marker.panelIconUrlFor(1, 3, 'curb'));
    expect(urlOf(pinOf(0))).toBe(marker.panelIconUrlFor(0, 3));
  });

  test('a plan whose rows are not built yet is left alone', () => {
    expect(() => approachControl.attachToPlan({})).not.toThrow();
  });
});

describe('pressing the toggle', () => {
  test('cycles the approach: curb, opposite, then any side again', () => {
    const plan = fakePlan(2);
    click(toggle(plan, 0));
    expect(plan.approachesNow()).toEqual(['curb', 'unrestricted']);
    click(toggle(plan, 0));
    expect(plan.approachesNow()).toEqual(['opposite', 'unrestricted']);
    click(toggle(plan, 0));
    expect(plan.approachesNow()).toEqual(['unrestricted', 'unrestricted']);
  });

  test('changes only the waypoint of its own row', () => {
    const plan = fakePlan(3);
    click(toggle(plan, 1));
    expect(plan.approachesNow()).toEqual(['unrestricted', 'curb', 'unrestricted']);
  });

  test('keeps the other options the waypoint carries', () => {
    const plan = fakePlan(2);
    plan._waypoints[0].options = { entrance: 'main' };
    plan.rebuild();
    click(toggle(plan, 0));
    expect(plan._waypoints[0].options).toEqual({ entrance: 'main', approach: 'curb' });
  });

  test('sets the same waypoint objects again, so the plan routes and redraws', () => {
    const plan = fakePlan(2);
    const before = plan.getWaypoints();
    click(toggle(plan, 1));
    plan.getWaypoints().forEach((wp, i) => expect(wp).toBe(before[i]));
    expect(plan.events.map(e => e.type)).toContain('waypointschanged');
  });

  test('announces the change before the waypoints change', () => {
    const plan = fakePlan(3);
    click(toggle(plan, 2));
    const types = plan.events.map(e => e.type).filter(t => t !== 'waypointsreorder');
    expect(types).toEqual(['waypointapproachchange', 'waypointschanged']);
    expect(plan.events[0].data).toEqual({ index: 2, approach: 'curb' });
  });

  test('the rebuilt row shows the new approach and its label', () => {
    const plan = fakePlan(2);
    click(toggle(plan, 0));
    expect(toggle(plan, 0).getAttribute('data-approach')).toBe('curb');
    expect(toggle(plan, 0).getAttribute('aria-label')).toMatch(/curb side/);
  });

  test('focus stays on the toggle of the same row', () => {
    const plan = fakePlan(3);
    click(toggle(plan, 1));
    expect(document.activeElement).toBe(toggle(plan, 1));
  });

  test('the rebuilt rows can be pressed again', () => {
    const plan = fakePlan(2);
    click(toggle(plan, 0));
    click(toggle(plan, 1));
    click(toggle(plan, 1));
    expect(plan.approachesNow()).toEqual(['curb', 'opposite']);
  });

  test('the click does not reach the map behind the panel', () => {
    const plan = fakePlan(2);
    const reached = jest.fn();
    document.body.addEventListener('click', reached);
    click(toggle(plan, 0));
    document.body.removeEventListener('click', reached);
    expect(reached).not.toHaveBeenCalled();
  });
});

describe('the keyboard', () => {
  test('Enter and Space press the toggle', () => {
    const plan = fakePlan(2);
    const enter = key(toggle(plan, 0), 'Enter');
    expect(plan.approachesNow()).toEqual(['curb', 'unrestricted']);
    expect(enter.defaultPrevented).toBe(true);
    key(toggle(plan, 0), ' ');
    expect(plan.approachesNow()).toEqual(['opposite', 'unrestricted']);
  });

  test('other keys do nothing, and are left to the browser', () => {
    const plan = fakePlan(2);
    const tab = key(toggle(plan, 0), 'Tab');
    key(toggle(plan, 0), 'a');
    expect(plan.approachesNow()).toEqual(['unrestricted', 'unrestricted']);
    expect(tab.defaultPrevented).toBe(false);
  });
});

describe('the approach stays with its waypoint', () => {
  test('when the row is moved with the grip', () => {
    const plan = fakePlan(3);
    click(toggle(plan, 0));
    const grip = rows(plan._geocoderContainer)[0].querySelector('.' + reorder.HANDLE_CLASS);
    key(grip, 'ArrowDown');
    expect(plan._waypoints.map(wp => wp.name)).toEqual(['wp1', 'wp0', 'wp2']);
    expect(plan.approachesNow()).toEqual(['unrestricted', 'curb', 'unrestricted']);
    expect(toggle(plan, 1).getAttribute('data-approach')).toBe('curb');
    expect(toggle(plan, 0).getAttribute('data-approach')).toBe('unrestricted');
  });

  test('when the waypoints are reversed', () => {
    const plan = fakePlan(3);
    click(toggle(plan, 0));
    plan._waypoints.reverse();
    plan.setWaypoints(plan._waypoints);
    expect(plan.approachesNow()).toEqual(['unrestricted', 'unrestricted', 'curb']);
    expect(toggle(plan, 2).getAttribute('data-approach')).toBe('curb');
  });

  test('a waypoint added later starts on the default', () => {
    const plan = fakePlan(2);
    click(toggle(plan, 0));
    plan.setWaypoints(plan.getWaypoints().concat([{ name: 'new', latLng: { lat: 9, lng: 9 } }]));
    expect(plan.approachesNow()).toEqual(['curb', 'unrestricted', 'unrestricted']);
  });
});

describe('updateLabels', () => {
  test('relabels the toggles for the new language, falling back to English', () => {
    const plan = fakePlan(2);
    plan._waypoints[0].options = { approach: 'curb' };
    plan.rebuild();
    approachControl.updateLabels(plan, 'de');
    expect(toggle(plan, 0).getAttribute('aria-label')).toBe(approachControl.labelFor('curb', 'de'));
    expect(toggle(plan, 0).getAttribute('aria-label')).toMatch(/curb side/);
    expect(toggle(plan, 0).getAttribute('data-approach')).toBe('curb');
  });

  test('tolerates a plan whose rows are not built yet', () => {
    expect(() => approachControl.updateLabels({}, 'de')).not.toThrow();
    expect(() => approachControl.updateLabels(null, 'de')).not.toThrow();
  });
});
