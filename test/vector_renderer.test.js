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

function loadingRenderer() {
  const gl = Object.assign(new L.Evented(), { getStyle: () => ({ sources: {} }), resize: jest.fn(), redraw: jest.fn() });
  const host = document.createElement('div');
  document.body.appendChild(host);
  const Adapter = L.Class.extend({
    getContainer: function() { return this._container; },
    getMaplibreMap: () => gl,
    _initContainer: function() { this._container = document.createElement('div'); },
    onAdd: function(map) {
      this._map = map;
      if (!this._container) this._initContainer();
      this.visibilityBeforeAppend = this._container.style.visibility;
      host.appendChild(this._container);
    },
    _update: jest.fn(),
    _resizeContainer: jest.fn(),
    _zoomEnd: jest.fn()
  });
  const Renderer = createBackgroundRenderer(Adapter);
  const renderer = new Renderer();
  const map = {};
  renderer.onAdd(map);
  return { renderer, gl, host, Adapter };
}

test('keeps the canvas hidden until the first complete map render without pausing camera updates', () => {
  const { renderer, gl, host, Adapter } = loadingRenderer();
  expect(renderer.visibilityBeforeAppend).toBe('hidden');
  gl.fire('styledata');
  gl.fire('render');
  expect(renderer.getContainer().style.visibility).toBe('hidden');
  renderer._update({});
  expect(Adapter.prototype._update).toHaveBeenCalledTimes(1);
  gl.fire('load');
  expect(renderer.getContainer().style.visibility).toBe('');
  gl.fire('dataloading');
  expect(renderer.getContainer().style.visibility).toBe('');
  host.remove();
});

test('does not reveal a still-loading background when visibility is toggled', () => {
  const { renderer, gl, host } = loadingRenderer();
  renderer.setVisible(false);
  renderer.setVisible(true);
  expect(renderer.getContainer().style.visibility).toBe('hidden');
  renderer.setVisible(false);
  gl.fire('load');
  expect(renderer.getContainer().style.visibility).toBe('hidden');
  renderer.setVisible(true);
  expect(renderer.getContainer().style.visibility).toBe('');
  host.remove();
});

test('ignores a late load event after a renderer is detached', () => {
  const { renderer, gl, host } = loadingRenderer();
  renderer._map = null;
  gl.fire('load');
  expect(renderer.getContainer().style.visibility).toBe('hidden');
  host.remove();
});
