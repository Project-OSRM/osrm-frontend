'use strict';

var nextPanelId = 0;

function attach(panel, options) {
  options = options || {};
  var handle = document.createElement('div');
  handle.className = 'osrm-panel-resizer';
  handle.tabIndex = 0;
  handle.setAttribute('role', 'separator');
  handle.setAttribute('aria-orientation', 'horizontal');
  if (!panel.id) {
    var panelId;
    do {
      panelId = 'osrm-directions-panel-' + (++nextPanelId);
    } while (document.getElementById(panelId));
    panel.id = panelId;
  }
  handle.setAttribute('aria-controls', panel.id);
  panel.insertBefore(handle, panel.firstChild);
  var snapIndex = 1;
  var restoreSnapIndex = 1;
  var drag;
  var frame;
  var settleTimer;
  var suppressClick = false;

  function mobileLayout() {
    return window.innerWidth <= 900 && !(window.innerHeight <= 500 && window.innerWidth > window.innerHeight);
  }

  function snapHeights() {
    var height = window.innerHeight;
    var compact = Math.min(height * 0.9, Math.max(160, height * 0.2));
    return [compact, Math.max(compact, height * 0.6), height * 0.9];
  }

  function notifyResize() {
    if (options.onResize) options.onResize();
  }

  function applyHeight(height) {
    var heights = snapHeights();
    height = Math.max(heights[0], Math.min(heights[2], height));
    panel.style.setProperty('--osrm-sheet-height', Math.round(height) + 'px');
    handle.setAttribute('aria-valuemin', Math.round(heights[0] / window.innerHeight * 100));
    handle.setAttribute('aria-valuemax', 90);
    handle.setAttribute('aria-valuenow', Math.round(height / window.innerHeight * 100));
    notifyResize();
  }

  function cancelMotion() {
    if (frame !== undefined) window.cancelAnimationFrame(frame);
    if (settleTimer !== undefined) window.clearTimeout(settleTimer);
    frame = settleTimer = undefined;
  }

  function releasePointer() {
    if (!drag) return;
    var pointerId = drag.pointerId;
    drag = undefined;
    if (handle.hasPointerCapture && handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
  }

  function selectSnap(index) {
    cancelMotion();
    index = Math.max(0, Math.min(2, index));
    if (index === 0 && snapIndex > 0) restoreSnapIndex = snapIndex;
    snapIndex = index;
    panel.classList.remove('osrm-panel-dragging');
    panel.classList.add('osrm-panel-resizing');
    applyHeight(snapHeights()[snapIndex]);
    settleTimer = window.setTimeout(function() {
      settleTimer = undefined;
      panel.classList.remove('osrm-panel-resizing');
      notifyResize();
    }, 200);
  }

  function resizeViewport() {
    cancelMotion();
    releasePointer();
    panel.classList.remove('osrm-panel-dragging', 'osrm-panel-resizing');
    handle.hidden = !mobileLayout();
    if (mobileLayout()) applyHeight(snapHeights()[snapIndex]);
    else {
      panel.style.removeProperty('--osrm-sheet-height');
      notifyResize();
    }
  }

  function pointerDown(event) {
    if (!mobileLayout() || panel.classList.contains('leaflet-routing-container-hide') || drag || event.button !== 0 || event.isPrimary === false) return;
    event.preventDefault();
    event.stopPropagation();
    cancelMotion();
    suppressClick = false;
    drag = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight: panel.getBoundingClientRect().height || snapHeights()[snapIndex],
      height: panel.getBoundingClientRect().height || snapHeights()[snapIndex],
      moved: false
    };
    panel.classList.add('osrm-panel-dragging', 'osrm-panel-resizing');
    handle.focus({ preventScroll: true });
    if (handle.setPointerCapture) handle.setPointerCapture(event.pointerId);
  }

  function pointerMove(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    drag.height = drag.startHeight + drag.startY - event.clientY;
    drag.moved = drag.moved || Math.abs(event.clientY - drag.startY) > 6;
    if (frame === undefined) frame = window.requestAnimationFrame(function() {
      frame = undefined;
      if (drag) applyHeight(drag.height);
    });
  }

  function finishDrag(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    var height = drag.height;
    var moved = drag.moved;
    var cancelled = event.type !== 'pointerup';
    releasePointer();
    cancelMotion();
    suppressClick = moved || cancelled;
    if (cancelled) selectSnap(snapIndex);
    else if (moved) {
      var nearest = snapHeights().reduce(function(best, candidate, index, heights) {
        return Math.abs(candidate - height) < Math.abs(heights[best] - height) ? index : best;
      }, 0);
      selectSnap(nearest);
    } else {
      panel.classList.remove('osrm-panel-dragging', 'osrm-panel-resizing');
      notifyResize();
    }
  }

  function click(event) {
    if (!mobileLayout()) return;
    event.preventDefault();
    event.stopPropagation();
    if (suppressClick) suppressClick = false;
    else selectSnap((snapIndex + 1) % 3);
  }

  function keyDown(event) {
    if (!mobileLayout()) return;
    var index;
    if (event.key === 'ArrowUp') index = snapIndex + 1;
    else if (event.key === 'ArrowDown') index = snapIndex - 1;
    else if (event.key === 'Home') index = 0;
    else if (event.key === 'End') index = 2;
    else if (event.key === 'Enter') index = snapIndex === 0 ? restoreSnapIndex : 0;
    else if (event.key === ' ') index = (snapIndex + 1) % 3;
    else return;
    event.preventDefault();
    event.stopPropagation();
    selectSnap(index);
  }

  function updateLocalization() {
    var label = options.translate ? options.translate('Resize directions pane') : 'Resize directions pane';
    handle.setAttribute('aria-label', label);
    handle.title = label;
  }

  handle.addEventListener('pointerdown', pointerDown);
  handle.addEventListener('pointermove', pointerMove);
  handle.addEventListener('pointerup', finishDrag);
  handle.addEventListener('pointercancel', finishDrag);
  handle.addEventListener('lostpointercapture', finishDrag);
  handle.addEventListener('click', click);
  handle.addEventListener('keydown', keyDown);
  window.addEventListener('resize', resizeViewport);
  updateLocalization();
  resizeViewport();

  return {
    updateLocalization: updateLocalization,
    destroy: function() {
      cancelMotion();
      releasePointer();
      window.removeEventListener('resize', resizeViewport);
      handle.removeEventListener('pointerdown', pointerDown);
      handle.removeEventListener('pointermove', pointerMove);
      handle.removeEventListener('pointerup', finishDrag);
      handle.removeEventListener('pointercancel', finishDrag);
      handle.removeEventListener('lostpointercapture', finishDrag);
      handle.removeEventListener('click', click);
      handle.removeEventListener('keydown', keyDown);
      panel.classList.remove('osrm-panel-dragging', 'osrm-panel-resizing');
      panel.style.removeProperty('--osrm-sheet-height');
      handle.remove();
    }
  };
}

module.exports = { attach: attach };
