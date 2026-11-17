'use strict';
const { EventEmitter } = require('events');
const { vectorStyle, configureLoadingBackground, applyPalette } = require('../src/vector_palette');
const vectorTheme = require('../src/vector_theme');

test('switches colors and restores original paint without replacing sources or styles', () => {
  const original = vectorStyle({ sources: { tiles: { type: 'vector' }, raster: { type: 'raster' } }, layers: [
    { id: 'water', type: 'fill', source: 'tiles', paint: { 'fill-color': '#abc', 'fill-pattern': 'water' } },
    { id: 'raster', type: 'raster', source: 'raster' }
  ] });
  expect(original.sources.raster).toBeUndefined();
  const map = { setPaintProperty: jest.fn() };
  applyPalette(map, original, 'dark');
  expect(map.setPaintProperty).toHaveBeenCalledWith('water', 'fill-pattern', null);
  expect(map.setPaintProperty).toHaveBeenCalledWith('water', 'fill-color', '#3d6489');
  map.setPaintProperty.mockClear();
  applyPalette(map, original, 'original');
  expect(map.setPaintProperty).toHaveBeenCalledWith('water', 'fill-pattern', 'water');
  expect(map.setPaintProperty).toHaveBeenCalledWith('water', 'fill-color', '#abc');
  expect(original.layers[0].paint['fill-color']).toBe('#abc');
});

function loadingBackground(style, theme = 'original') {
  const map = Object.assign(new EventEmitter(), { setPaintProperty: jest.fn() });
  const renderer = Object.assign(new EventEmitter(), {
    options: { transformStyle: (previous, next) => theme === 'original' ? next : vectorTheme.transformStyle(previous, next) },
    getMaplibreMap: () => map
  });
  const isLoading = configureLoadingBackground(renderer);
  renderer.emit('add');
  const initialStyle = renderer.options.transformStyle(null, style);
  return { renderer, map, isLoading, initialStyle };
}

test.each(['original', 'dark'])('keeps only the background transparent during %s map loading', theme => {
  const style = { sources: {}, layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#fefefe' } },
    { id: 'water', type: 'fill', paint: { 'fill-color': '#abc' } },
    { id: 'street', type: 'line', paint: { 'line-width': 2 } },
    { id: 'name', type: 'symbol', layout: { 'text-field': 'River' } }
  ] };
  const { renderer, map, isLoading, initialStyle } = loadingBackground(style, theme);
  expect(initialStyle.layers).toHaveLength(4);
  expect(initialStyle.layers[0].paint['background-color']).toBe('transparent');
  const expected = theme === 'original' ? style : vectorTheme.transformStyle(null, style);
  expect(initialStyle.layers.slice(1)).toEqual(expected.layers.slice(1));
  expect(style.layers[0].paint['background-color']).toBe('#fefefe');
  map.emit('styledata');
  map.emit('render');
  expect(map.setPaintProperty).not.toHaveBeenCalled();
  expect(isLoading()).toBe(true);
  map.emit('load');
  expect(isLoading()).toBe(false);
  expect(map.setPaintProperty.mock.calls).toEqual([
    ['background', 'background-color', theme === 'original' ? '#fefefe' : vectorTheme.palette.background]
  ]);
  expect(renderer.options.transformStyle(null, style)).toEqual(expected);
  map.emit('dataloading');
  expect(isLoading()).toBe(false);
  expect(map.setPaintProperty).toHaveBeenCalledTimes(1);
});

test('does not apply a loading background to a renderer that has been removed', () => {
  const { renderer, map, isLoading } = loadingBackground({ layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#fff' } }
  ] });
  renderer.getMaplibreMap = () => null;
  map.emit('load');
  expect(isLoading()).toBe(true);
  expect(map.setPaintProperty).not.toHaveBeenCalled();
});

test('supports transparent overlays without background layers', () => {
  const style = { layers: [{ id: 'components', type: 'line', paint: { 'line-color': 'red' } }] };
  const { map, initialStyle, isLoading } = loadingBackground(style);
  expect(initialStyle).toEqual(style);
  map.emit('load');
  expect(isLoading()).toBe(false);
  expect(map.setPaintProperty).not.toHaveBeenCalled();
});
