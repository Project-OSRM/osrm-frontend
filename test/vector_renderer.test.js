/**
 * @jest-environment jsdom
 */
'use strict';

const L = require('leaflet');
const createBackgroundRenderer = require('../src/vector_renderer');

function createRenderer(gl) {
  const calls = [];
  const container = document.createElement('div');
  document.body.appendChild(container);
  const Base = L.Class.extend({
    getMaplibreMap: () => gl,
    getContainer: () => container,
    _pinchZoom: () => calls.push('camera'),
    onRemove: jest.fn()
  });
  const Renderer = createBackgroundRenderer(Base);
  return { renderer: new Renderer(), calls, container, Base };
}

test('updates the vector camera and draws it within the current zoom frame', () => {
  const gl = { redraw: jest.fn() };
  const { renderer, calls, container } = createRenderer(gl);
  gl.redraw.mockImplementation(() => calls.push('render'));
  renderer._pinchZoom({ smoothWheel: true });
  expect(calls).toEqual(['camera', 'render']);
  container.remove();
});

test('keeps normal pinch rendering under the adapter control', () => {
  const gl = { redraw: jest.fn() };
  const { renderer, calls, container } = createRenderer(gl);
  renderer._pinchZoom({ pinch: true });
  expect(calls).toEqual(['camera']);
  expect(gl.redraw).not.toHaveBeenCalled();
  container.remove();
});

test('removes the normal renderer through the adapter', () => {
  const { renderer, Base, container } = createRenderer({});
  const map = {};
  renderer.onRemove(map);
  expect(Base.prototype.onRemove).toHaveBeenCalledWith(map);
  container.remove();
});

test('removes the partial container safely after WebGL initialization failed', () => {
  const { renderer, Base, container } = createRenderer(null);
  expect(() => renderer.onRemove({})).not.toThrow();
  expect(container.isConnected).toBe(false);
  expect(Base.prototype.onRemove).not.toHaveBeenCalled();
});


test('pauses a hidden renderer and resumes its existing map at the current viewport', () => {
  const gl = { resize: jest.fn(), redraw: jest.fn(), getStyle: () => ({ sources: {} }) };
  const { renderer, calls, container, Base } = createRenderer(gl);
  Base.prototype._resizeContainer = jest.fn();
  Base.prototype._zoomEnd = jest.fn();
  Base.prototype._update = jest.fn();
  Base.prototype._transitionEnd = jest.fn();
  Base.prototype.getEvents = () => ({ move: Base.prototype._update, resize: Base.prototype._transitionEnd });
  renderer._map = { attributionControl: { removeAttribution: jest.fn(), addAttribution: jest.fn() } };
  const handlers = renderer.getEvents();
  renderer.setVisible(false);
  expect(container.style.visibility).toBe('hidden');
  expect(renderer.getAttribution()).toBe('');
  handlers.move.call(renderer, {});
  handlers.resize.call(renderer, {});
  renderer._update({});
  renderer._transitionEnd({});
  renderer._pinchZoom({ smoothWheel: true });
  expect(Base.prototype._update).not.toHaveBeenCalled();
  expect(Base.prototype._transitionEnd).not.toHaveBeenCalled();
  expect(calls).toEqual([]);
  renderer.setVisible(true);
  expect(container.style.visibility).toBe('');
  expect(gl.resize).toHaveBeenCalledTimes(1);
  expect(Base.prototype._zoomEnd).toHaveBeenCalledTimes(1);
  expect(gl.redraw).toHaveBeenCalledTimes(1);
  handlers.move.call(renderer, {});
  expect(Base.prototype._update).toHaveBeenCalledTimes(1);
  expect(Base.prototype.onRemove).not.toHaveBeenCalled();
  container.remove();
});
