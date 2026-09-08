'use strict';

// Reordering waypoints from the input panel (issue #19).
//
// Each waypoint row carries a grip at its right-hand end. Dragging the grip
// with a mouse, pen or finger lifts the row and slides the others out of its
// way; dropping it moves the waypoint to where the row landed. The grip also
// takes keyboard focus, and the up and down arrow keys move the waypoint one
// row at a time, so reordering does not depend on a pointer.
//
// The rows themselves are rebuilt by Leaflet Routing Machine every time the
// waypoints change, so nothing here holds on to a row: attachToPlan runs after
// every rebuild and wires whatever rows are there now.

var L = require('leaflet');
var localization = require('./localization');

var ROW_CLASS = 'leaflet-routing-geocoder';
var HANDLE_CLASS = 'leaflet-routing-waypoint-handle';
var DRAGGING_ROW_CLASS = 'leaflet-routing-geocoder-dragging';
var DRAGGING_LIST_CLASS = 'leaflet-routing-geocoders-dragging';

// How far the pointer has to travel before a press on the grip counts as a
// drag rather than a click, so focusing the grip does not twitch the row.
var DRAG_THRESHOLD_PX = 3;

var LABEL_KEY = 'Drag to reorder';

// Returns a copy of `list` with the item at `from` moved to `to`. Indexes
// outside the list are clamped, so the callers need not check.
function moveWaypoint(list, from, to) {
  var last = list.length - 1;
  from = Math.max(0, Math.min(last, from));
  to = Math.max(0, Math.min(last, to));
  var moved = list.slice();
  var item = moved.splice(from, 1)[0];
  moved.splice(to, 0, item);
  return moved;
}

function handleLabel(language) {
  return localization.t(language, LABEL_KEY);
}

function setHandleLabel(handle, language) {
  var label = handleLabel(language);
  handle.setAttribute('title', label);
  handle.setAttribute('aria-label', label);
}

// Drop-in for Leaflet Routing Machine's createGeocoder option: the same row
// (input and remove button, with the same class names the stylesheet keys on)
// plus the grip between them.
function createGeocoder(i, nWps, options) {
  var container = L.DomUtil.create('div', ROW_CLASS);
  var input = L.DomUtil.create('input', '', container);
  var handle = L.DomUtil.create('span', HANDLE_CLASS, container);
  var remove = options.addWaypoints ? L.DomUtil.create('span', 'leaflet-routing-remove-waypoint', container) : undefined;

  input.disabled = !options.addWaypoints;

  handle.setAttribute('role', 'button');
  handle.setAttribute('tabindex', '0');
  setHandleLabel(handle, options.language);

  return {
    container: container,
    input: input,
    closeButton: remove
  };
}

function rowsOf(container) {
  return Array.prototype.slice.call(container.querySelectorAll('.' + ROW_CLASS));
}

function handleOf(row) {
  return row.querySelector('.' + HANDLE_CLASS);
}

// The row the dragged one would land on. Moving down, it passes a row once
// its bottom edge is past that row's middle; moving up, once its top edge
// is. So a neighbour swaps after half a row of travel, and the end rows are
// reachable with the row pinned to the list's ends.
function dropIndexFor(rects, from, dy) {
  var top = rects[from].top + dy;
  var bottom = top + rects[from].height;
  var index = from;
  var i;
  if (dy > 0) {
    for (i = from + 1; i < rects.length; i++) {
      if (rects[i].top + rects[i].height / 2 < bottom) index = i;
    }
  } else {
    for (i = from - 1; i >= 0; i--) {
      if (rects[i].top + rects[i].height / 2 > top) index = i;
    }
  }
  return index;
}

// Slides the rows between the dragged row and its drop target out of the way,
// so the gap the row will drop into is visible while it is still in the air.
function shiftRows(rows, from, to, draggedHeight) {
  for (var i = 0; i < rows.length; i++) {
    if (i === from) continue;
    var shift = 0;
    if (to > from && i > from && i <= to) shift = -draggedHeight;
    if (to < from && i >= to && i < from) shift = draggedHeight;
    rows[i].style.transform = shift ? 'translateY(' + shift + 'px)' : '';
  }
}

function clearShifts(rows) {
  for (var i = 0; i < rows.length; i++) {
    rows[i].style.transform = '';
  }
}

function wirePointerDrag(container, row, from, onMove) {
  var handle = handleOf(row);

  L.DomEvent.on(handle, 'pointerdown', function(e) {
    // Only the primary button: a right-click on the grip is a context menu.
    if (e.button) return;

    var rows = rowsOf(container);
    var rects = rows.map(function(r) {
      return r.getBoundingClientRect();
    });
    // Every pointer has its own id; a second finger, or a mouse alongside a
    // pen, must not steer or drop the row this one lifted.
    var pointerId = e.pointerId;
    var startY = e.clientY;
    // The row stays within the list: past its ends there is nowhere to drop,
    // and the list clips (or scrolls) whatever leaves it.
    var last = rects[rects.length - 1];
    var minDy = rects[0].top - rects[from].top;
    var maxDy = (last.top + last.height) - (rects[from].top + rects[from].height);
    var dragging = false;
    var to = from;

    function isThisPointer(e) {
      return e.pointerId === undefined || e.pointerId === pointerId;
    }

    function move(e) {
      if (!isThisPointer(e)) return;
      var dy = e.clientY - startY;
      if (!dragging) {
        if (Math.abs(dy) < DRAG_THRESHOLD_PX) return;
        dragging = true;
        L.DomUtil.addClass(row, DRAGGING_ROW_CLASS);
        L.DomUtil.addClass(container, DRAGGING_LIST_CLASS);
      }
      dy = Math.max(minDy, Math.min(maxDy, dy));
      row.style.transform = 'translateY(' + dy + 'px)';
      to = dropIndexFor(rects, from, dy);
      shiftRows(rows, from, to, rects[from].height);
    }

    function finish() {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', drop);
      document.removeEventListener('pointercancel', cancel);
      document.removeEventListener('keydown', escape);
      if (handle.releasePointerCapture) {
        try {
          handle.releasePointerCapture(pointerId);
        } catch (err) {}
      }
      clearShifts(rows);
      L.DomUtil.removeClass(row, DRAGGING_ROW_CLASS);
      L.DomUtil.removeClass(container, DRAGGING_LIST_CLASS);
    }

    function drop(e) {
      if (!isThisPointer(e)) return;
      var moved = dragging && to !== from;
      finish();
      if (moved) onMove(from, to, false);
    }

    function cancel(e) {
      if (e && !isThisPointer(e)) return;
      finish();
    }

    function escape(e) {
      if (e.key === 'Escape' || e.key === 'Esc') finish();
    }

    // preventDefault stops the press selecting text and, on a touch screen,
    // stops the compatibility mouse events that would otherwise reach the
    // map. Stopping propagation keeps Leaflet's own handlers out of it.
    L.DomEvent.stop(e);
    // preventDefault also stops the press giving the grip focus, which it
    // needs so the arrow keys work after a click. preventScroll: focusing
    // must not scroll the list, or the row positions measured above are
    // wrong for the whole drag.
    handle.focus({preventScroll: true});
    if (handle.setPointerCapture) {
      try {
        handle.setPointerCapture(pointerId);
      } catch (err) {}
    }
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', drop);
    document.addEventListener('pointercancel', cancel);
    document.addEventListener('keydown', escape);
  });
}

function wireKeyboard(row, from, count, onMove) {
  L.DomEvent.on(handleOf(row), 'keydown', function(e) {
    var to;
    if (e.key === 'ArrowUp' || e.key === 'Up') {
      to = from - 1;
    } else if (e.key === 'ArrowDown' || e.key === 'Down') {
      to = from + 1;
    } else {
      return;
    }
    L.DomEvent.stop(e);
    if (to < 0 || to >= count) return;
    onMove(from, to, true);
  });
}

// Wires the grips of the rows currently in `container`. onMove(from, to,
// viaKeyboard) is called once per completed reorder.
function attach(container, onMove) {
  var rows = rowsOf(container);
  rows.forEach(function(row, i) {
    if (!handleOf(row)) return;
    wirePointerDrag(container, row, i, onMove);
    wireKeyboard(row, i, rows.length, onMove);
  });
}

function focusHandle(container, index) {
  var row = rowsOf(container)[index];
  var handle = row && handleOf(row);
  if (handle) handle.focus();
}

// Call after the plan has rebuilt its geocoder rows. A reorder re-orders the
// plan's waypoints, which rebuilds the rows again; a keyboard reorder then
// puts focus back on the grip it left, in its new row.
function attachToPlan(plan) {
  var container = plan._geocoderContainer;
  if (!container) return;
  attach(container, function(from, to, viaKeyboard) {
    // Fired before the change so a listener can decide how to treat the
    // waypointschanged and route that follow.
    plan.fire('waypointsreorder', {from: from, to: to});
    plan.setWaypoints(moveWaypoint(plan.getWaypoints(), from, to));
    if (viaKeyboard) focusHandle(plan._geocoderContainer, to);
  });
}

// Re-labels the grips when the interface language changes; the rows are not
// rebuilt for that.
function updateLabels(container, language) {
  if (!container) return;
  rowsOf(container).forEach(function(row) {
    var handle = handleOf(row);
    if (handle) setHandleLabel(handle, language);
  });
}

module.exports = {
  moveWaypoint: moveWaypoint,
  createGeocoder: createGeocoder,
  attach: attach,
  attachToPlan: attachToPlan,
  focusHandle: focusHandle,
  updateLabels: updateLabels,
  HANDLE_CLASS: HANDLE_CLASS,
  DRAGGING_ROW_CLASS: DRAGGING_ROW_CLASS,
  DRAGGING_LIST_CLASS: DRAGGING_LIST_CLASS,
  DRAG_THRESHOLD_PX: DRAG_THRESHOLD_PX
};
