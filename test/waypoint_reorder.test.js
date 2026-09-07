/**
 * @jest-environment jsdom
 */
'use strict';

// Waypoints can be reordered from the input panel, by dragging a row's grip
// or by moving it with the arrow keys (issue #19).

const reorder = require('../src/waypoint_reorder');

const ROW_HEIGHT = 40;

// Builds the rows the plan would build for `count` waypoints and lays them
// out as a column, since jsdom does not do layout.
function buildRows(count, options) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  for (let i = 0; i < count; i++) {
    const row = reorder.createGeocoder(i, count, options || { addWaypoints: true, language: 'en' }).container;
    row.querySelector('input').value = 'wp' + i;
    row.getBoundingClientRect = () => ({ top: i * ROW_HEIGHT, height: ROW_HEIGHT, bottom: (i + 1) * ROW_HEIGHT });
    container.appendChild(row);
  }
  return container;
}

function rows(container) {
  return Array.from(container.querySelectorAll('.leaflet-routing-geocoder'));
}

function handle(container, i) {
  return rows(container)[i].querySelector('.' + reorder.HANDLE_CLASS);
}

function order(container) {
  return rows(container).map(row => row.querySelector('input').value);
}

// jsdom has no PointerEvent; the handlers only read clientY, button and
// pointerId, so a MouseEvent carrying a pointerId stands in for one.
function pointer(target, type, clientY, extra) {
  const init = Object.assign({ bubbles: true, clientY: clientY, button: 0, pointerId: 1 }, extra);
  const event = new window.MouseEvent(type, init);
  Object.defineProperty(event, 'pointerId', { value: init.pointerId });
  target.dispatchEvent(event);
}

function key(target, keyName) {
  target.dispatchEvent(new window.KeyboardEvent('keydown', { key: keyName, bubbles: true }));
}

function centreOf(i) {
  return i * ROW_HEIGHT + ROW_HEIGHT / 2;
}

// A plan that does what the real one does on setWaypoints: rebuilds its rows
// and wires them again.
function fakePlan(count) {
  const plan = {
    _waypoints: Array.from({ length: count }, (_, i) => ({ name: 'wp' + i })),
    getWaypoints() {
      return this._waypoints.slice();
    },
    setWaypoints(waypoints) {
      this._waypoints = waypoints;
      this.rebuild();
    },
    rebuild() {
      if (this._geocoderContainer) this._geocoderContainer.remove();
      this._geocoderContainer = buildRows(this._waypoints.length);
      rows(this._geocoderContainer).forEach((row, i) => {
        row.querySelector('input').value = this._waypoints[i].name;
      });
      reorder.attachToPlan(this);
    }
  };
  plan.rebuild();
  return plan;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('moveWaypoint', () => {
  test('moves an item forward and backward without touching the input', () => {
    const list = ['a', 'b', 'c', 'd'];
    expect(reorder.moveWaypoint(list, 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(reorder.moveWaypoint(list, 3, 1)).toEqual(['a', 'd', 'b', 'c']);
    expect(list).toEqual(['a', 'b', 'c', 'd']);
  });

  test('a move onto itself is a copy', () => {
    expect(reorder.moveWaypoint(['a', 'b'], 1, 1)).toEqual(['a', 'b']);
  });

  test('clamps indexes to the list', () => {
    expect(reorder.moveWaypoint(['a', 'b', 'c'], 0, 99)).toEqual(['b', 'c', 'a']);
    expect(reorder.moveWaypoint(['a', 'b', 'c'], -5, 1)).toEqual(['b', 'a', 'c']);
  });
});

describe('createGeocoder', () => {
  test('keeps the input and remove button Leaflet Routing Machine expects', () => {
    const g = reorder.createGeocoder(0, 2, { addWaypoints: true, language: 'en' });
    expect(g.container.className).toBe('leaflet-routing-geocoder');
    expect(g.input.tagName).toBe('INPUT');
    expect(g.input.disabled).toBe(false);
    expect(g.closeButton.className).toBe('leaflet-routing-remove-waypoint');
  });

  test('without addWaypoints the input is disabled and there is no remove button', () => {
    const g = reorder.createGeocoder(0, 2, { addWaypoints: false, language: 'en' });
    expect(g.input.disabled).toBe(true);
    expect(g.closeButton).toBeUndefined();
  });

  test('the grip is a focusable, labelled button between input and remove', () => {
    const g = reorder.createGeocoder(1, 3, { addWaypoints: true, language: 'en' });
    const grip = g.container.querySelector('.' + reorder.HANDLE_CLASS);
    expect(grip.getAttribute('role')).toBe('button');
    expect(grip.getAttribute('tabindex')).toBe('0');
    expect(grip.getAttribute('aria-label')).toMatch(/Drag to reorder/);
    expect(grip.getAttribute('title')).toBe(grip.getAttribute('aria-label'));
    expect(Array.from(g.container.children)).toEqual([g.input, grip, g.closeButton]);
  });

  test('the grip is labelled in the interface language', () => {
    const g = reorder.createGeocoder(0, 2, { addWaypoints: true, language: 'de' });
    const grip = g.container.querySelector('.' + reorder.HANDLE_CLASS);
    expect(grip.getAttribute('aria-label')).toMatch(/Umsortieren/);
  });
});

describe('dragging a grip', () => {
  let container, moves;

  beforeEach(() => {
    container = buildRows(4);
    moves = [];
    reorder.attach(container, (from, to, viaKeyboard) => moves.push([from, to, viaKeyboard]));
  });

  test('drops the row where its middle ends up', () => {
    const grip = handle(container, 0);
    pointer(grip, 'pointerdown', centreOf(0));
    pointer(document, 'pointermove', centreOf(2) + 1);
    pointer(document, 'pointerup', centreOf(2) + 1);
    expect(moves).toEqual([[0, 2, false]]);
  });

  test('can move a row up', () => {
    pointer(handle(container, 3), 'pointerdown', centreOf(3));
    pointer(document, 'pointermove', centreOf(1) - 1);
    pointer(document, 'pointerup', centreOf(1) - 1);
    expect(moves).toEqual([[3, 1, false]]);
  });

  test('lifts the row and slides the rows it passes out of the way', () => {
    pointer(handle(container, 0), 'pointerdown', centreOf(0));
    pointer(document, 'pointermove', centreOf(0) + 50);
    expect(rows(container)[0].classList.contains(reorder.DRAGGING_ROW_CLASS)).toBe(true);
    expect(container.classList.contains(reorder.DRAGGING_LIST_CLASS)).toBe(true);
    expect(rows(container).map(r => r.style.transform)).toEqual([
      'translateY(50px)', 'translateY(-' + ROW_HEIGHT + 'px)', '', ''
    ]);

    pointer(document, 'pointerup', centreOf(0) + 50);
    expect(rows(container)[0].classList.contains(reorder.DRAGGING_ROW_CLASS)).toBe(false);
    expect(container.classList.contains(reorder.DRAGGING_LIST_CLASS)).toBe(false);
    expect(rows(container).map(r => r.style.transform)).toEqual(['', '', '', '']);
  });

  test('the row cannot be dragged past either end of the list', () => {
    pointer(handle(container, 0), 'pointerdown', centreOf(0));
    pointer(document, 'pointermove', centreOf(0) - 100);
    expect(rows(container)[0].style.transform).toBe('translateY(0px)');
    pointer(document, 'pointermove', centreOf(0) + 1000);
    expect(rows(container)[0].style.transform).toBe('translateY(' + 3 * ROW_HEIGHT + 'px)');
    pointer(document, 'pointerup', centreOf(0) + 1000);
    expect(moves).toEqual([[0, 3, false]]);
  });

  test('a press that barely moves is a click, not a drag', () => {
    pointer(handle(container, 1), 'pointerdown', centreOf(1));
    pointer(document, 'pointermove', centreOf(1) + reorder.DRAG_THRESHOLD_PX - 1);
    expect(rows(container)[1].style.transform).toBe('');
    pointer(document, 'pointerup', centreOf(1) + reorder.DRAG_THRESHOLD_PX - 1);
    expect(moves).toEqual([]);
  });

  test('dropping a row back where it was reorders nothing', () => {
    pointer(handle(container, 1), 'pointerdown', centreOf(1));
    pointer(document, 'pointermove', centreOf(1) + 10);
    pointer(document, 'pointerup', centreOf(1) + 10);
    expect(moves).toEqual([]);
  });

  test('Escape abandons the drag and puts the rows back', () => {
    pointer(handle(container, 0), 'pointerdown', centreOf(0));
    pointer(document, 'pointermove', centreOf(2));
    key(document, 'Escape');
    expect(rows(container).map(r => r.style.transform)).toEqual(['', '', '', '']);
    expect(rows(container)[0].classList.contains(reorder.DRAGGING_ROW_CLASS)).toBe(false);
    // The listeners are gone: a later release does nothing.
    pointer(document, 'pointerup', centreOf(2));
    expect(moves).toEqual([]);
  });

  test('a cancelled pointer abandons the drag', () => {
    pointer(handle(container, 0), 'pointerdown', centreOf(0));
    pointer(document, 'pointermove', centreOf(2));
    pointer(document, 'pointercancel', centreOf(2));
    pointer(document, 'pointerup', centreOf(2));
    expect(moves).toEqual([]);
    expect(rows(container).map(r => r.style.transform)).toEqual(['', '', '', '']);
  });

  test('another pointer cannot steer or drop the row this one lifted', () => {
    pointer(handle(container, 0), 'pointerdown', centreOf(0), { pointerId: 1 });
    pointer(document, 'pointermove', centreOf(2) + 1, { pointerId: 2 });
    expect(rows(container)[0].style.transform).toBe('');
    pointer(document, 'pointerup', centreOf(2) + 1, { pointerId: 2 });
    expect(moves).toEqual([]);
    pointer(document, 'pointercancel', centreOf(2) + 1, { pointerId: 2 });

    // The drag is still live for the pointer that started it.
    pointer(document, 'pointermove', centreOf(2) + 1, { pointerId: 1 });
    pointer(document, 'pointerup', centreOf(2) + 1, { pointerId: 1 });
    expect(moves).toEqual([[0, 2, false]]);
  });

  test('only the primary button starts a drag', () => {
    pointer(handle(container, 0), 'pointerdown', centreOf(0), { button: 2 });
    pointer(document, 'pointermove', centreOf(2));
    pointer(document, 'pointerup', centreOf(2));
    expect(moves).toEqual([]);
  });

  test('the press does not reach the map and gives the grip focus', () => {
    const grip = handle(container, 0);
    const event = new window.MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientY: 0, button: 0 });
    let reachedDocument = false;
    document.addEventListener('pointerdown', () => { reachedDocument = true; }, { once: true });
    grip.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(reachedDocument).toBe(false);
    expect(document.activeElement).toBe(grip);
    pointer(document, 'pointerup', 0);
  });
});

describe('moving a row with the keyboard', () => {
  test('the arrow keys move the row one step and report it as a keyboard move', () => {
    const container = buildRows(3);
    const moves = [];
    reorder.attach(container, (from, to, viaKeyboard) => moves.push([from, to, viaKeyboard]));
    key(handle(container, 1), 'ArrowDown');
    key(handle(container, 1), 'ArrowUp');
    expect(moves).toEqual([[1, 2, true], [1, 0, true]]);
  });

  test('the first row cannot move up and the last cannot move down', () => {
    const container = buildRows(3);
    const moves = [];
    reorder.attach(container, (from, to, viaKeyboard) => moves.push([from, to, viaKeyboard]));
    key(handle(container, 0), 'ArrowUp');
    key(handle(container, 2), 'ArrowDown');
    expect(moves).toEqual([]);
  });

  test('other keys are left alone', () => {
    const container = buildRows(3);
    const moves = [];
    reorder.attach(container, (from, to, viaKeyboard) => moves.push([from, to, viaKeyboard]));
    const event = new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    handle(container, 1).dispatchEvent(event);
    expect(moves).toEqual([]);
    expect(event.defaultPrevented).toBe(false);
  });

  test('the arrow keys do not reach the map, which would pan it', () => {
    const container = buildRows(3);
    reorder.attach(container, () => {});
    const event = new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
    let reachedDocument = false;
    document.addEventListener('keydown', () => { reachedDocument = true; }, { once: true });
    handle(container, 1).dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(reachedDocument).toBe(false);
  });
});

describe('attachToPlan', () => {
  test('a drag reorders the plan and the rebuilt rows follow', () => {
    const plan = fakePlan(4);
    pointer(handle(plan._geocoderContainer, 0), 'pointerdown', centreOf(0));
    pointer(document, 'pointermove', centreOf(3) + 1);
    pointer(document, 'pointerup', centreOf(3) + 1);
    expect(plan.getWaypoints().map(wp => wp.name)).toEqual(['wp1', 'wp2', 'wp3', 'wp0']);
    expect(order(plan._geocoderContainer)).toEqual(['wp1', 'wp2', 'wp3', 'wp0']);
  });

  test('a keyboard move keeps focus on the grip that moved, in its new row', () => {
    const plan = fakePlan(3);
    const grip = handle(plan._geocoderContainer, 0);
    grip.focus();
    key(grip, 'ArrowDown');
    expect(plan.getWaypoints().map(wp => wp.name)).toEqual(['wp1', 'wp0', 'wp2']);
    expect(document.activeElement).toBe(handle(plan._geocoderContainer, 1));

    key(document.activeElement, 'ArrowDown');
    expect(plan.getWaypoints().map(wp => wp.name)).toEqual(['wp1', 'wp2', 'wp0']);
    expect(document.activeElement).toBe(handle(plan._geocoderContainer, 2));
  });

  test('the rebuilt rows can be dragged again', () => {
    const plan = fakePlan(3);
    key(handle(plan._geocoderContainer, 0), 'ArrowDown');
    pointer(handle(plan._geocoderContainer, 2), 'pointerdown', centreOf(2));
    pointer(document, 'pointermove', centreOf(0));
    pointer(document, 'pointerup', centreOf(0));
    expect(plan.getWaypoints().map(wp => wp.name)).toEqual(['wp2', 'wp1', 'wp0']);
  });

  test('a plan without rows yet is left alone', () => {
    expect(() => reorder.attachToPlan({})).not.toThrow();
  });
});

describe('updateLabels', () => {
  test('relabels every grip in the new language', () => {
    const container = buildRows(2);
    reorder.updateLabels(container, 'de');
    rows(container).forEach(row => {
      const grip = row.querySelector('.' + reorder.HANDLE_CLASS);
      expect(grip.getAttribute('aria-label')).toMatch(/Umsortieren/);
      expect(grip.getAttribute('title')).toMatch(/Umsortieren/);
    });
    reorder.updateLabels(container, 'en');
    expect(handle(container, 0).getAttribute('title')).toMatch(/Drag to reorder/);
  });

  test('tolerates a plan whose rows are not built yet', () => {
    expect(() => reorder.updateLabels(null, 'de')).not.toThrow();
  });
});
