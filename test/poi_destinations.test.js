'use strict';

const { createExpression, featureFilter, validateStyleMin } = require('@maplibre/maplibre-gl-style-spec');
const style = require('../images/openstreetmap/style.json');
const theme = require('../src/vector_theme');
const { imageDefinition } = require('../src/poi_icons');
const { registerVectorImages } = require('../src/vector_images');
const sprites = require('../images/openstreetmap/sprites.json');
const { localizeStyle } = require('../src/vector_labels');
const satellite = require('../src/vector_satellite');

function matches(layer, properties) {
  return featureFilter(layer.filter, 'layers[0].filter').filter({ zoom: 17 }, { type: 1, properties });
}

function evaluate(expression, properties, zoom = 17) {
  if (!Array.isArray(expression)) return expression;
  const parsed = createExpression(expression, 'layers[0].layout.icon-image');
  expect(parsed.result).toBe('success');
  return parsed.value.evaluate({ zoom }, { type: 1, properties });
}

test.each([
  ['amenity', 'fuel', 'poi-destination-fuel'],
  ['amenity', 'hospital', 'poi-destination-hospital'],
  ['amenity', 'clinic', 'poi-destination-medical'],
  ['amenity', 'pharmacy', 'poi-destination-medical'],
  ['tourism', 'hotel', 'poi-destination-lodging'],
  ['tourism', 'motel', 'poi-destination-lodging'],
  ['tourism', 'hostel', 'poi-destination-lodging'],
  ['tourism', 'guest_house', 'poi-destination-lodging'],
  ['tourism', 'bed_and_breakfast', 'poi-destination-lodging'],
  ['tourism', 'camp_site', 'poi-destination-camping'],
  ['tourism', 'caravan_site', 'poi-destination-camping'],
  ['amenity', 'courthouse', 'poi-destination-civic'],
  ['amenity', 'embassy', 'poi-destination-civic'],
  ['office', 'diplomatic', 'poi-destination-civic'],
  ['historic', 'castle', 'poi-destination-historic'],
  ['historic', 'fort', 'poi-destination-historic'],
  ['tourism', 'viewpoint', 'poi-destination-viewpoint'],
  ['tourism', 'zoo', 'poi-destination-zoo'],
  ['tourism', 'alpine_hut', 'poi-destination-alpine-hut']
])('labels %s=%s once with a resolvable icon', (field, kind, id) => {
  const properties = { [field]: kind, name: 'Destination' };
  const layers = style.layers.filter(layer => layer['source-layer'] === 'pois' && matches(layer, properties));
  expect(layers.map(layer => layer.id)).toEqual([id]);
  const layer = layers[0];
  expect(evaluate(layer.layout['text-field'], properties)).toBe('Destination');
  expect(evaluate(layer.layout['text-field'], { [field]: kind })).toBe('');
  const icon = evaluate(layer.layout['icon-image'], properties);
  expect(icon.startsWith('basics:') ? sprites[icon.slice(7)] : imageDefinition(icon)).toBeTruthy();
});

test('retains generic amenities while keeping destination detail at street zooms', () => {
  const generic = style.layers.find(layer => layer.id === 'poi-amenity');
  expect(matches(generic, { amenity: 'bench' })).toBe(true);
  expect(matches(generic, { amenity: 'cafe' })).toBe(true);
  const selected = style.layers.filter(layer => layer.id.startsWith('poi-destination-'));
  for (const layer of selected) {
    expect(matches(layer, { amenity: 'bench' })).toBe(false);
    expect(evaluate(layer.paint['text-opacity'], {}, layer.minzoom)).toBe(0);
    expect(evaluate(layer.paint['text-opacity'], {}, layer.minzoom + 0.4)).toBe(1);
    expect(layer.layout['text-allow-overlap']).not.toBe(true);
    expect(layer.layout['text-optional']).toBe(true);
  }
  expect(selected.find(layer => layer.id.endsWith('hospital')).minzoom)
    .toBeLessThan(selected.find(layer => layer.id.endsWith('lodging')).minzoom);
});

test.each(['camp_site', 'caravan_site'])('uses a green camping accent for %s without adding a second icon', tourism => {
  const layer = style.layers.find(candidate => candidate.id === 'poi-destination-camping');
  const generic = style.layers.find(candidate => candidate.id === 'poi-tourism');
  expect(matches(generic, { tourism })).toBe(false);
  expect(layer.minzoom).toBe(14);
  expect(layer.paint['text-color']).toBe('#4f7751');
  const dark = theme.transformStyle(null, style).layers.find(candidate => candidate.id === layer.id);
  expect(evaluate(dark.paint['text-color'], { tourism })).toBe('#a0c59b');
  expect(evaluate(dark.paint['icon-color'], { tourism })).toBe('#a0c59b');
  expect(evaluate(layer.layout['icon-image'], { tourism })).toBe(tourism === 'camp_site' ? 'osrm-poi-campsite' : 'osrm-poi-caravan');
});

test.each([
  [{ amenity: 'courthouse' }, 'basics:icon-town_hall'],
  [{ amenity: 'embassy' }, 'basics:icon-embassy'],
  [{ office: 'diplomatic' }, 'basics:icon-embassy'],
  [{ amenity: 'embassy', office: 'diplomatic' }, 'basics:icon-embassy']
])('uses one civic symbol with neutral colors for %j', (properties, icon) => {
  const layers = style.layers.filter(layer => layer['source-layer'] === 'pois' && matches(layer, properties));
  expect(layers.map(layer => layer.id)).toEqual(['poi-destination-civic']);
  const layer = layers[0];
  expect(layer.minzoom).toBe(15);
  expect(evaluate(layer.layout['icon-image'], properties)).toBe(icon);
  expect(sprites[icon.slice(7)]).toBeTruthy();
  expect(layer.paint['text-color']).toBe('#5a6874');
  const dark = theme.transformStyle(null, style).layers.find(candidate => candidate.id === layer.id);
  expect(evaluate(dark.paint['text-color'], properties)).toBe('#a8bacb');
  expect(evaluate(dark.paint['icon-color'], properties)).toBe('#a8bacb');
  expect(style.layers.indexOf(layer)).toBeLessThan(style.layers.findIndex(candidate => candidate.id === 'label-street-primary'));
});

test('labels castles and forts without promoting every historic feature into a named destination', () => {
  const destination = style.layers.find(layer => layer.id === 'poi-destination-historic');
  const generic = style.layers.find(layer => layer.id === 'poi-historic');
  for (const historic of ['monument', 'memorial', 'ruins', 'archaeological_site', 'wayside_shrine']) {
    expect(matches(destination, { historic, name: 'Historic place' })).toBe(false);
    expect(matches(generic, { historic })).toBe(true);
  }
  expect(matches(destination, { name: 'Unclassified place' })).toBe(false);
  expect(destination.layout['icon-image']).toBe('basics:icon-castle');
  expect(sprites['icon-castle'].sdf).toBe(true);
  expect(destination.minzoom).toBe(15);
  expect(destination.layout['text-size']).toBe(11);
  expect(destination.layout['text-optional']).toBe(true);
  expect(destination.layout['icon-optional']).toBe(false);
  expect(destination.layout['text-ignore-placement']).not.toBe(true);
  for (const id of ['label-street-primary', 'label-place-city', 'label-place-hamlet']) {
    expect(style.layers.indexOf(destination)).toBeLessThan(style.layers.findIndex(layer => layer.id === id));
  }
});

test('uses translated historic landmark names and falls back to the local name', () => {
  const destination = style.layers.find(layer => layer.id === 'poi-destination-historic');
  const french = localizeStyle(style, 'fr-CA').layers.find(layer => layer.id === destination.id);
  expect(evaluate(french.layout['text-field'], { historic: 'castle', name: 'Local name', name_fr: 'Château' })).toBe('Château');
  expect(evaluate(french.layout['text-field'], { historic: 'castle', name: 'Fort Konstantin' })).toBe('Fort Konstantin');
  expect(evaluate(french.layout['text-field'], { historic: 'castle', name: 'Local name', name_fr: '' })).toBe('Local name');
  expect(evaluate(french.layout['text-field'], { historic: 'fort' })).toBe('');
});

test('keeps historic destinations readable in both palettes and out of the Satellite street overlay', () => {
  const original = style.layers.find(layer => layer.id === 'poi-destination-historic');
  const dark = theme.transformStyle(null, style);
  const darkDestination = dark.layers.find(layer => layer.id === original.id);
  expect(original.paint['text-color']).toBe('#806957');
  for (const historic of ['castle', 'fort']) {
    expect(evaluate(darkDestination.paint['text-color'], { historic })).toBe('#a8bacb');
    expect(evaluate(darkDestination.paint['icon-color'], { historic })).toBe('#a8bacb');
  }
  const overlay = satellite.transformStyle(style);
  expect(validateStyleMin(overlay)).toEqual([]);
  expect(overlay.sources).toEqual(style.sources);
  expect(overlay.layers.find(layer => layer.id === original.id).layout.visibility).toBe('none');
});

test.each([
  { tourism: 'viewpoint' },
  { tourism: 'viewpoint', man_made: 'tower', 'tower:type': 'observation' }
])('uses one viewpoint symbol, including observation towers: %j', properties => {
  const layers = style.layers.filter(layer => layer['source-layer'] === 'pois' && matches(layer, properties));
  expect(layers.map(layer => layer.id)).toEqual(['poi-destination-viewpoint']);
  const layer = layers[0];
  expect(layer.minzoom).toBe(14);
  expect(layer.layout['icon-image']).toBe('basics:icon-viewpoint');
  expect(sprites['icon-viewpoint'].sdf).toBe(true);
  expect(layer.layout['text-size']).toBe(11);
  expect(layer.paint['text-color']).toBe('#4f7751');
  expect(layer.layout['text-ignore-placement']).not.toBe(true);
  const dark = theme.transformStyle(null, style).layers.find(candidate => candidate.id === layer.id);
  expect(evaluate(dark.paint['text-color'], properties)).toBe('#a0c59b');
  expect(evaluate(dark.paint['icon-color'], properties)).toBe('#a0c59b');
  for (const id of ['label-street-primary', 'label-place-city', 'label-place-hamlet']) {
    expect(style.layers.indexOf(layer)).toBeLessThan(style.layers.findIndex(candidate => candidate.id === id));
  }
});

test('keeps ordinary towers and other tourism symbols without promoting them to viewpoints', () => {
  const viewpoint = style.layers.find(layer => layer.id === 'poi-destination-viewpoint');
  const manMade = style.layers.find(layer => layer.id === 'poi-man_made');
  const tourism = style.layers.find(layer => layer.id === 'poi-tourism');
  for (const properties of [{ man_made: 'tower' }, { man_made: 'lighthouse' }, { man_made: 'windmill' }]) {
    expect(matches(manMade, properties)).toBe(true);
    expect(matches(viewpoint, properties)).toBe(false);
  }
  for (const kind of ['chalet', 'picnic_site', 'information']) {
    expect(matches(tourism, { tourism: kind })).toBe(true);
    expect(matches(viewpoint, { tourism: kind })).toBe(false);
  }
  const overlay = satellite.transformStyle(style);
  expect(validateStyleMin(overlay)).toEqual([]);
  expect(overlay.sources).toEqual(style.sources);
  expect(overlay.layers.find(layer => layer.id === viewpoint.id).layout.visibility).toBe('none');
});

test('uses the tile-provided Spanish viewpoint name and falls back to local names when unavailable', () => {
  const id = 'poi-destination-viewpoint';
  const properties = { name: 'Domturm', name_de: 'Domturm', name_es: 'catedral de san bartolome', tourism: 'viewpoint' };
  const spanish = localizeStyle(style, 'es').layers.find(layer => layer.id === id);
  expect(evaluate(spanish.layout['text-field'], properties)).toBe('catedral de san bartolome');
  const french = localizeStyle(style, 'fr').layers.find(layer => layer.id === id);
  expect(evaluate(french.layout['text-field'], properties)).toBe('Domturm');
  expect(evaluate(spanish.layout['text-field'], { ...properties, name_es: '' })).toBe('Domturm');
  expect(evaluate(spanish.layout['text-field'], { tourism: 'viewpoint' })).toBe('');
});

test('labels zoo destinations at detail zooms while leaving other parks and animal facilities unchanged', () => {
  const layer = style.layers.find(candidate => candidate.id === 'poi-destination-zoo');
  const generic = style.layers.find(candidate => candidate.id === 'poi-tourism');
  expect(matches(generic, { tourism: 'zoo' })).toBe(false);
  for (const properties of [
    { leisure: 'park', name: 'Wildlife park' },
    { leisure: 'playground', name: 'Zoo playground' },
    { amenity: 'animal_shelter' },
    { tourism: 'theme_park' },
    { name: 'Zoo road' }
  ]) expect(matches(layer, properties)).toBe(false);
  expect(matches(generic, { tourism: 'picnic_site' })).toBe(true);
  expect(layer.layout['icon-image']).toBe('basics:icon-zoo');
  expect(sprites['icon-zoo'].sdf).toBe(true);
  expect(layer.minzoom).toBe(15);
  expect(layer.layout['text-size']).toBe(11);
  expect(layer.layout['icon-optional']).toBe(false);
  expect(layer.layout['text-ignore-placement']).not.toBe(true);
  for (const id of ['label-street-primary', 'label-place-city', 'label-place-hamlet']) {
    expect(style.layers.indexOf(layer)).toBeLessThan(style.layers.findIndex(candidate => candidate.id === id));
  }
});

test('uses the tile-provided French zoo name, with local fallback and an icon for unnamed sites', () => {
  const id = 'poi-destination-zoo';
  const properties = { name: 'Zoo Frankfurt', name_de: 'Zoo Frankfurt', name_fr: 'Jardin Zoologique de Francfort', tourism: 'zoo', housenumber: '1' };
  const french = localizeStyle(style, 'fr-CA').layers.find(layer => layer.id === id);
  expect(evaluate(french.layout['text-field'], properties)).toBe('Jardin Zoologique de Francfort');
  const english = localizeStyle(style, 'en').layers.find(layer => layer.id === id);
  expect(evaluate(english.layout['text-field'], properties)).toBe('Zoo Frankfurt');
  expect(evaluate(french.layout['text-field'], { ...properties, name_fr: '' })).toBe('Zoo Frankfurt');
  expect(evaluate(french.layout['text-field'], { tourism: 'zoo' })).toBe('');
  expect(evaluate(french.layout['icon-image'], { tourism: 'zoo' })).toBe('basics:icon-zoo');
});

test('keeps zoo symbols and names green in both palettes without adding another source or Satellite POIs', () => {
  const id = 'poi-destination-zoo';
  const original = style.layers.find(layer => layer.id === id);
  const dark = theme.transformStyle(null, style);
  const darkZoo = dark.layers.find(layer => layer.id === id);
  expect(original.paint['text-color']).toBe('#4f7751');
  expect(evaluate(darkZoo.paint['text-color'], { tourism: 'zoo' })).toBe('#a0c59b');
  expect(evaluate(darkZoo.paint['icon-color'], { tourism: 'zoo' })).toBe('#a0c59b');
  const overlay = satellite.transformStyle(style);
  for (const palette of [style, dark, overlay]) {
    expect(validateStyleMin(palette)).toEqual([]);
    expect(palette.sources).toEqual(style.sources);
    expect(palette.layers.find(layer => layer.id === id).filter).toEqual(original.filter);
  }
  expect(overlay.layers.find(layer => layer.id === id).layout.visibility).toBe('none');
});

test('marks alpine huts without classifying chalets or day shelters as mountain accommodation', () => {
  const layer = style.layers.find(candidate => candidate.id === 'poi-destination-alpine-hut');
  const generic = style.layers.find(candidate => candidate.id === 'poi-tourism');
  expect(matches(generic, { tourism: 'alpine_hut' })).toBe(false);
  for (const properties of [
    { tourism: 'chalet', name: 'Mountain hut' },
    { amenity: 'shelter', name: 'Mountain hut' },
    { tourism: 'wilderness_hut' },
    { building: 'cabin' },
    { name: 'Mountain hut' }
  ]) expect(matches(layer, properties)).toBe(false);
  expect(matches(generic, { tourism: 'chalet' })).toBe(true);
  expect(layer.layout['icon-image']).toBe('basics:icon-chalet');
  expect(sprites['icon-chalet'].sdf).toBe(true);
  expect(layer.minzoom).toBe(14);
  expect(layer.layout['text-size']).toBe(11);
  expect(layer.layout['icon-optional']).toBe(false);
  expect(layer.layout['text-ignore-placement']).not.toBe(true);
  for (const id of ['label-street-primary', 'label-place-city', 'label-place-hamlet']) {
    expect(style.layers.indexOf(layer)).toBeLessThan(style.layers.findIndex(candidate => candidate.id === id));
  }
});

test('uses the tile-provided English alpine hut name with local fallback and unnamed symbols', () => {
  const id = 'poi-destination-alpine-hut';
  const properties = { name: 'Monte Rosa Hütte', name_en: 'Monte Rosa Hut', tourism: 'alpine_hut' };
  const english = localizeStyle(style, 'en-GB').layers.find(layer => layer.id === id);
  expect(evaluate(english.layout['text-field'], properties)).toBe('Monte Rosa Hut');
  const german = localizeStyle(style, 'de').layers.find(layer => layer.id === id);
  expect(evaluate(german.layout['text-field'], properties)).toBe('Monte Rosa Hütte');
  expect(evaluate(english.layout['text-field'], { ...properties, name_en: '' })).toBe('Monte Rosa Hütte');
  expect(evaluate(english.layout['text-field'], { tourism: 'alpine_hut' })).toBe('');
  expect(evaluate(english.layout['icon-image'], { tourism: 'alpine_hut' })).toBe('basics:icon-chalet');
});

test('keeps alpine huts green in both palettes and hidden on the Satellite street overlay', () => {
  const id = 'poi-destination-alpine-hut';
  const original = style.layers.find(layer => layer.id === id);
  const dark = theme.transformStyle(null, style);
  const darkHut = dark.layers.find(layer => layer.id === id);
  expect(original.paint['text-color']).toBe('#4f7751');
  expect(evaluate(darkHut.paint['text-color'], { tourism: 'alpine_hut' })).toBe('#a0c59b');
  expect(evaluate(darkHut.paint['icon-color'], { tourism: 'alpine_hut' })).toBe('#a0c59b');
  const overlay = satellite.transformStyle(style);
  for (const palette of [style, dark, overlay]) {
    expect(validateStyleMin(palette)).toEqual([]);
    expect(palette.sources).toEqual(style.sources);
    expect(palette.layers.find(layer => layer.id === id).filter).toEqual(original.filter);
  }
  expect(overlay.layers.find(layer => layer.id === id).layout.visibility).toBe('none');
});

test('labels named parks and keeps other leisure symbols distinct', () => {
  const layer = style.layers.find(candidate => candidate.id === 'label-park-name');
  const generic = style.layers.find(candidate => candidate.id === 'poi-leisure');
  const park = { leisure: 'park', name: 'Bethmannpark' };
  expect(layer['source-layer']).toBe('pois');
  expect(matches(layer, park)).toBe(true);
  expect(evaluate(layer.layout['text-field'], park)).toBe(park.name);
  expect(layer.layout['icon-image']).toBeUndefined();
  expect(matches(generic, park)).toBe(false);
  expect(matches(generic, { leisure: 'park' })).toBe(false);
  expect(matches(generic, { leisure: 'playground' })).toBe(true);
  for (const properties of [
    { leisure: 'park' },
    { leisure: 'park', name: '' },
    { leisure: 'playground', name: 'Playground' },
    { tourism: 'zoo', name: 'Zoo Frankfurt' }
  ]) expect(matches(layer, properties)).toBe(false);
});

test.each([
  ['sports_centre', 'sports', 'icon-sports', 15],
  ['stadium', 'sports', 'icon-stadium', 15],
  ['playground', 'playground', 'icon-playground', 16]
])('labels named %s features with the matching sprite and keeps unnamed icons', (leisure, kind, icon, minzoom) => {
  const id = 'poi-destination-' + kind;
  const generic = style.layers.find(layer => layer.id === 'poi-leisure');
  const layer = style.layers.find(candidate => candidate.id === id);
  const named = { leisure, name: 'Recreation destination' };
  const matching = style.layers.filter(candidate => candidate['source-layer'] === 'pois' && matches(candidate, named));
  expect(matching.map(candidate => candidate.id)).toEqual([id]);
  expect(evaluate(layer.layout['text-field'], named)).toBe(named.name);
  expect(evaluate(layer.layout['icon-image'], named)).toBe('basics:' + icon);
  expect(sprites[icon].sdf).toBe(true);
  expect(layer.minzoom).toBe(minzoom);
  expect(matches(layer, { leisure })).toBe(false);
  expect(matches(layer, { leisure, name: '' })).toBe(false);
  expect(matches(generic, { leisure })).toBe(true);
  expect(matches(generic, { leisure, name: '' })).toBe(true);
  expect(matches(layer, { leisure: 'pitch', name: 'Field' })).toBe(false);
  expect(matches(layer, { leisure: 'park', name: 'Park' })).toBe(false);
});

test('keeps the recreation labels legible and below park, street and settlement labels', () => {
  const dark = theme.transformStyle(null, style);
  const overlay = satellite.transformStyle(style);
  for (const palette of [style, dark, overlay]) {
    expect(validateStyleMin(palette)).toEqual([]);
    expect(palette.sources).toEqual(style.sources);
  }
  for (const kind of ['sports', 'playground']) {
    const id = 'poi-destination-' + kind;
    const layer = style.layers.find(candidate => candidate.id === id);
    for (const higher of ['label-park-name', 'label-street-primary', 'label-place-neighbourhood']) {
      expect(style.layers.indexOf(layer)).toBeLessThan(style.layers.findIndex(candidate => candidate.id === higher));
    }
    expect(layer.layout['text-allow-overlap']).not.toBe(true);
    expect(layer.layout['icon-allow-overlap']).not.toBe(true);
    expect(layer.layout['text-ignore-placement']).not.toBe(true);
    expect(layer.paint['text-color']).toBe('#2c482e');
    expect(layer.paint['text-halo-width']).toBe(1);
    expect(dark.layers.find(candidate => candidate.id === id).paint).toMatchObject({
      'text-color': '#e0f1d5', 'icon-color': '#e0f1d5',
      'text-halo-color': '#263a2a', 'text-halo-width': 1, 'text-halo-blur': 0
    });
    expect(overlay.layers.find(candidate => candidate.id === id).layout.visibility).toBe('none');
  }
});

test('fades compact park names in below street and place labels in both palettes', () => {
  const id = 'label-park-name';
  const layer = style.layers.find(candidate => candidate.id === id);
  expect(layer.minzoom).toBe(14);
  expect(layer.layout['text-size']).toBe(11);
  expect(layer.layout['text-allow-overlap']).not.toBe(true);
  expect(layer.layout['text-ignore-placement']).not.toBe(true);
  expect(evaluate(layer.paint['text-opacity'], {}, 14)).toBe(0);
  expect(evaluate(layer.paint['text-opacity'], {}, 14.25)).toBeCloseTo(0.5);
  expect(evaluate(layer.paint['text-opacity'], {}, 14.5)).toBe(1);
  for (const label of ['label-street-residential', 'label-street-primary', 'label-place-neighbourhood']) {
    expect(style.layers.indexOf(layer)).toBeLessThan(style.layers.findIndex(candidate => candidate.id === label));
  }
  expect(layer.paint).toMatchObject({
    'text-color': '#2c482e',
    'text-halo-color': '#f8f7eb',
    'text-halo-width': 1
  });
  const dark = theme.transformStyle(null, style);
  const darkPark = dark.layers.find(candidate => candidate.id === id);
  expect(darkPark.paint).toMatchObject({
    'text-color': '#e0f1d5',
    'text-halo-color': '#263a2a',
    'text-halo-width': 1,
    'text-halo-blur': 0,
    'text-opacity': layer.paint['text-opacity']
  });
  expect(darkPark.filter).toEqual(layer.filter);
  expect(dark.sources).toEqual(style.sources);
  expect(satellite.transformStyle(style).layers.find(candidate => candidate.id === id).layout.visibility).toBe('none');
});

test('shares one first-request resolver for road plates, exits, and local POI symbols', async () => {
  const images = new Map();
  let resolveMissingImage;
  const addImage = jest.fn((id, image, options) => images.set(id, { image, options }));
  registerVectorImages({
    setMissingStyleImageResolver: resolver => { resolveMissingImage = resolver; },
    hasImage: id => images.has(id), addImage
  });
  const ids = ['osrm-road-shield', 'osrm-exit-shield', 'osrm-poi-fuel', 'osrm-poi-lodging', 'osrm-poi-campsite', 'osrm-poi-caravan'];
  await Promise.all([...ids, ...ids, 'unrelated'].map(resolveMissingImage));
  expect([...images.keys()]).toEqual(ids);
  expect(addImage).toHaveBeenCalledTimes(ids.length);
  for (const id of ids.slice(2)) {
    expect(images.get(id).options.sdf).toBe(true);
    expect(images.get(id).image.data.length).toBe(32 * 32 * 4);
  }
  const alpha = (image, x, y) => image.data[(y * image.width + x) * 4 + 3];
  const fuel = images.get('osrm-poi-fuel').image;
  expect(alpha(fuel, 8, 20)).toBeGreaterThan(191);
  expect(alpha(fuel, 12, 11)).toBeLessThan(191);
  const lodging = images.get('osrm-poi-lodging').image;
  expect(alpha(lodging, 20, 17)).toBeGreaterThan(191);
  expect(alpha(lodging, 20, 6)).toBeLessThan(191);
  const tent = images.get('osrm-poi-campsite').image;
  expect(alpha(tent, 10, 23)).toBeGreaterThan(191);
  expect(alpha(tent, 16, 23)).toBeLessThan(191);
  const caravan = images.get('osrm-poi-caravan').image;
  expect(alpha(caravan, 11, 25)).toBeGreaterThan(191);
  expect(alpha(caravan, 11, 13)).toBeLessThan(191);
  expect(imageDefinition('unrelated')).toBeNull();
});

test('keeps readable category colors and the same sources and layout in both palettes', () => {
  const dark = theme.transformStyle(null, style);
  expect(validateStyleMin(style)).toEqual([]);
  expect(validateStyleMin(dark)).toEqual([]);
  expect(dark.sources).toEqual(style.sources);
  for (const layer of style.layers.filter(layer => layer.id.startsWith('poi-destination-'))) {
    const counterpart = dark.layers.find(candidate => candidate.id === layer.id);
    expect(counterpart.layout).toEqual(layer.layout);
    expect(counterpart.filter).toEqual(layer.filter);
    if (['poi-destination-sports', 'poi-destination-playground'].includes(layer.id)) continue;
    const properties = layer.id.endsWith('lodging') ? { tourism: 'hotel' } : { amenity: 'hospital' };
    const color = evaluate(counterpart.paint['text-color'], properties);
    expect(color).toBe(properties.tourism ? '#c3b5df' : '#e4a9b3');
    expect(evaluate(counterpart.paint['icon-color'], properties)).toBe(color);
  }
});
