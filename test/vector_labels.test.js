'use strict';

const { createExpression, validateStyleMin } = require('@maplibre/maplibre-gl-style-spec');
const { localizedTextField, localizeStyle, applyLanguage } = require('../src/vector_labels');
const theme = require('../src/vector_theme');
const original = require('../images/openstreetmap/style.json');

function text(field, properties, language) {
  const expression = createExpression(localizedTextField(field, language), 'layers[0].layout.text-field');
  expect(expression.result).toBe('success');
  return expression.value.evaluate({ zoom: 16 }, { properties });
}

test('uses tile translations and falls back to the local name for missing or empty values', () => {
  const properties = { name: 'Rhein', name_en: 'Rhine', name_fr: 'Le Rhin', name_it: '' };
  expect(text(['get', 'name'], properties, 'en')).toBe('Rhine');
  expect(text(['get', 'name'], properties, 'fr')).toBe('Le Rhin');
  expect(text(['get', 'name'], properties, 'de')).toBe('Rhein');
  expect(text(['get', 'name'], properties, 'it')).toBe('Rhein');
  expect(text(['coalesce', ['get', 'name'], ''], {}, 'en')).toBe('');
});

test.each(['pt-BR', 'pt-br', 'pt_BR'])('prefers a regional %s name and then the base language', language => {
  const properties = { name: 'Local', 'name_pt-BR': 'Regional', name_pt: 'Portuguese' };
  expect(text(['get', 'name'], properties, language)).toBe('Regional');
  properties['name_pt-BR'] = '';
  expect(text(['get', 'name'], properties, language)).toBe('Portuguese');
  delete properties.name_pt;
  expect(text(['get', 'name'], properties, language)).toBe('Local');
});

test('prefers script-specific names before the base language and the local name', () => {
  const properties = { name: 'Local', 'name_zh-Hans': '简体', name_zh: '中文' };
  expect(text(['get', 'name'], properties, 'zh-hans-CN')).toBe('简体');
  delete properties['name_zh-Hans'];
  expect(text(['get', 'name'], properties, 'zh-Hans')).toBe('中文');
  delete properties.name_zh;
  expect(text(['get', 'name'], properties, 'zh-Hans')).toBe('Local');
});

test.each([undefined, '', 'bad/code', 'en;get', 1])('falls back safely for unsupported language input %j', language => {
  expect(text(['get', 'name'], { name: 'Local', name_en: 'English' }, language)).toBe('Local');
});

test('localizes name tokens and nested name expressions without translating refs or literals', () => {
  const properties = { name: 'Local', name_en: 'English', ref: 'A 5' };
  expect(text('{name}', properties, 'en')).toBe('English');
  expect(text(['concat', ['get', 'name'], ' (', ['get', 'ref'], ')'], properties, 'en')).toBe('English (A 5)');
  for (const field of ['{ref}', '{housenumber}', 'Literal name', ['get', 'ref'], ['literal', ['get', 'name']], ['get', 'name', ['literal', { name: 'Object value' }]]]) {
    expect(localizedTextField(field, 'en')).toBe(field);
  }
});

test('changes only name fields in a valid style and preserves the source style', () => {
  const before = JSON.stringify(original);
  for (const style of [original, theme.transformStyle(null, original)]) {
    const localized = localizeStyle(style, 'fr');
    expect(validateStyleMin(localized)).toEqual([]);
    expect(localized.sources).toBe(style.sources);
    for (let i = 0; i < style.layers.length; i++) {
      const { layout, ...geometryAndPaint } = style.layers[i];
      expect({ ...localized.layers[i], layout: undefined }).toEqual({ ...geometryAndPaint, layout: undefined });
      if (layout) {
        const { 'text-field': field, ...otherLayout } = layout;
        const { 'text-field': localizedField, ...localizedLayout } = localized.layers[i].layout;
        expect(localizedLayout).toEqual(otherLayout);
        if (field === '{ref}' || field === '{housenumber}') expect(localizedField).toBe(field);
      }
    }
  }
  expect(JSON.stringify(original)).toBe(before);
});

test('updates names on the existing map and restores local names without nesting fallbacks', () => {
  const map = { setLayoutProperty: jest.fn(), setStyle: jest.fn(), addSource: jest.fn() };
  const fieldFor = id => map.setLayoutProperty.mock.calls.findLast(call => call[0] === id)[2];
  applyLanguage(map, original, 'en');
  const properties = { name: 'Rhein', name_en: 'Rhine', name_fr: 'Le Rhin' };
  expect(createExpression(fieldFor('label-water-river'), 'layers[0].layout.text-field').value.evaluate({ zoom: 16 }, { properties })).toBe('Rhine');
  applyLanguage(map, original, 'fr');
  const french = fieldFor('label-water-river');
  expect(createExpression(french, 'layers[0].layout.text-field').value.evaluate({ zoom: 16 }, { properties })).toBe('Le Rhin');
  expect(JSON.stringify(french)).not.toContain('name_en');
  applyLanguage(map, original, '');
  expect(createExpression(fieldFor('label-water-river'), 'layers[0].layout.text-field').value.evaluate({ zoom: 16 }, { properties })).toBe('Rhein');
  const changed = map.setLayoutProperty.mock.calls.map(call => call[0]);
  expect(changed).not.toContain('label-motorway-shield');
  expect(changed).not.toContain('label-address-housenumber');
  expect(map.setStyle).not.toHaveBeenCalled();
  expect(map.addSource).not.toHaveBeenCalled();
});
