'use strict';
const { vectorStyle, applyPalette } = require('../src/vector_palette');

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
