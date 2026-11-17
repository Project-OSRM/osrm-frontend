'use strict';
const { shieldImage, exitShieldImage, IMAGE_ID, EXIT_IMAGE_ID } = require('../src/road_shields');
const { registerVectorImages } = require('../src/vector_images');
const { validateStyleMin, featureFilter } = require('@maplibre/maplibre-gl-style-spec');
const style = require('../images/openstreetmap/style.json');
const theme = require('../src/vector_theme');

test('resolves road plates for the first image request across tiles without late registration', async () => {
  const images = new Map();
  let resolveMissingImage;
  const map = {
    setMissingStyleImageResolver: resolver => { resolveMissingImage = resolver; },
    hasImage: id => images.has(id),
    addImage: jest.fn((id, image, options) => images.set(id, { image, options }))
  };
  registerVectorImages(map);
  await resolveMissingImage('unrelated');
  expect(map.addImage).not.toHaveBeenCalled();
  // Each tile must receive the image in its first response. An event listener
  // that adds it after the response has been built cannot satisfy this request.
  async function requestTileImages() {
    if (!images.has(IMAGE_ID)) await resolveMissingImage(IMAGE_ID);
    return images.get(IMAGE_ID);
  }
  const responses = await Promise.all([requestTileImages(), requestTileImages(), requestTileImages()]);
  expect(responses.every(response => response && response.image.width === 64)).toBe(true);
  expect(map.addImage).toHaveBeenCalledWith(IMAGE_ID, expect.objectContaining({ width: 64, height: 40 }), expect.objectContaining({ pixelRatio: 2, content: [2, 2, 62, 38] }));
  await resolveMissingImage(IMAGE_ID);
  expect(map.addImage).toHaveBeenCalledTimes(1);
  const image = shieldImage();
  expect(image.data[3]).toBe(0);
  expect([...image.data.slice((20 * 64 + 32) * 4, (20 * 64 + 32) * 4 + 4)]).toEqual([248, 247, 243, 255]);
});

test('restores a shield after the style image registry is reset', () => {
  const images = new Set();
  let resolveMissingImage;
  const map = {
    setMissingStyleImageResolver: resolver => { resolveMissingImage = resolver; },
    hasImage: id => images.has(id),
    addImage: jest.fn(id => images.add(id))
  };
  registerVectorImages(map);
  resolveMissingImage(IMAGE_ID);
  images.clear();
  resolveMissingImage(IMAGE_ID);
  expect(images.has(IMAGE_ID)).toBe(true);
  expect(map.addImage).toHaveBeenCalledTimes(2);
});

test('resolves distinct exit badges with an unstretched branching-road symbol on the first request', async () => {
  const images = new Map();
  let resolveMissingImage;
  registerVectorImages({
    setMissingStyleImageResolver: resolver => { resolveMissingImage = resolver; },
    hasImage: id => images.has(id),
    addImage: (id, image, options) => images.set(id, { image, options })
  });
  await Promise.all([resolveMissingImage(EXIT_IMAGE_ID), resolveMissingImage(IMAGE_ID), resolveMissingImage(EXIT_IMAGE_ID)]);
  expect(images.size).toBe(2);
  const exit = images.get(EXIT_IMAGE_ID);
  expect(exit.image.width).toBe(96);
  expect(exit.options.content[0]).toBeGreaterThan(30);
  expect(exit.options.stretchX[0][0]).toBeGreaterThan(exit.options.content[0]);
  expect(exit.options.stretchY.every(([start, end]) => end <= 8 || start >= 32)).toBe(true);
  const pixel = (image, x, y) => [...image.data.slice((y * image.width + x) * 4, (y * image.width + x) * 4 + 4)];
  expect(pixel(exit.image, 14, 28)).toEqual([248, 248, 248, 255]);
  expect(pixel(exit.image, 28, 10)).toEqual([248, 248, 248, 255]);
  expect(pixel(exit.image, 60, 20)).toEqual([36, 89, 111, 255]);
  expect(pixel(exit.image, 60, 20)).not.toEqual(pixel(images.get(IMAGE_ID).image, 32, 20));
  expect(pixel(exitShieldImage(), 0, 0)[3]).toBe(0);
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
    expect(layers[index].layout['icon-text-fit-padding']).toEqual([1, 2, 1, 2]);
  }
  expect(validateStyleMin(style)).toEqual([]);
  const dark = theme.transformStyle(null, style);
  expect(validateStyleMin(dark)).toEqual([]);
  for (const layer of layers) {
    expect(dark.layers.find(candidate => candidate.id === layer.id).paint).toEqual(layer.paint);
  }
});
