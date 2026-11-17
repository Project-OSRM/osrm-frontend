'use strict';
const { registerRoadShields, shieldImage, IMAGE_ID } = require('../src/road_shields');
const { validateStyleMin, featureFilter } = require('@maplibre/maplibre-gl-style-spec');
const style = require('../images/openstreetmap/style.json');
const theme = require('../src/vector_theme');

test('provides crisp, stretchable road plates on demand without duplicate registration', () => {
  const handlers = {};
  const map = { on: (event, handler) => { handlers[event] = handler; }, hasImage: jest.fn(() => false), addImage: jest.fn() };
  registerRoadShields(map);
  handlers.styleimagemissing({ id: 'unrelated' });
  expect(map.addImage).not.toHaveBeenCalled();
  handlers.styleimagemissing({ id: IMAGE_ID });
  expect(map.addImage).toHaveBeenCalledWith(IMAGE_ID, expect.objectContaining({ width: 64, height: 40 }), expect.objectContaining({ pixelRatio: 2, content: [10, 6, 54, 34] }));
  map.hasImage.mockReturnValue(true);
  handlers.styleimagemissing({ id: IMAGE_ID });
  expect(map.addImage).toHaveBeenCalledTimes(1);
  const image = shieldImage();
  expect(image.data[3]).toBe(0);
  expect([...image.data.slice((20 * 64 + 32) * 4, (20 * 64 + 32) * 4 + 4)]).toEqual([248, 247, 243, 255]);
});

test('labels motorway and main-road references at usable zooms and excludes empty references', () => {
  const layers = style.layers.filter(layer => layer.id.endsWith('-shield'));
  expect(layers.map(layer => layer.minzoom)).toEqual([10, 11, 12]);
  for (const [kind, index] of [['motorway', 0], ['trunk', 1], ['primary', 1], ['secondary', 2]]) {
    const filter = featureFilter(layers[index].filter, 'layers[0].filter').filter;
    expect(filter({ zoom: 14 }, { type: 2, properties: { kind, ref: 'A 661' } })).toBe(true);
    expect(filter({ zoom: 14 }, { type: 2, properties: { kind, ref: '' } })).toBe(false);
    expect(filter({ zoom: 14 }, { type: 2, properties: { kind } })).toBe(false);
    expect(layers[index].layout['icon-text-fit']).toBe('both');
  }
  expect(validateStyleMin(style)).toEqual([]);
  const dark = theme.transformStyle(null, style);
  expect(validateStyleMin(dark)).toEqual([]);
  for (const layer of layers) {
    expect(dark.layers.find(candidate => candidate.id === layer.id).paint).toEqual(layer.paint);
  }
});
