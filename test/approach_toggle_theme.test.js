'use strict';

// The approach toggle and the reorder grip sit side by side in each waypoint
// row, so they should read as the same colour in every theme and state. The
// stylesheets are parsed as text and the cascade resolved here, rather than
// through jsdom, whose CSS support is unreliable for data URIs and gradients.

const fs = require('node:fs');

const TOGGLE_CLASS = 'leaflet-routing-approach-toggle';
const GRIP_CLASS = 'leaflet-routing-waypoint-handle';
const DARK_THEME_CLASS = 'osrm-theme-dark';
const APPROACH_STATES = [undefined, 'curb', 'opposite'];
const INTERACTION_STATES = [null, 'hover', 'focus'];

// Every rule of site.css then theme.css, in the order index.html loads them.
const cssRules = ['../css/site.css', '../css/theme.css'].flatMap(path => parseRules(
  fs.readFileSync(require.resolve(path), 'utf8')
));

function parseRules(cssText) {
  const withoutComments = cssText.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [];
  // Innermost blocks only, so a rule inside @media is found by its own selector.
  for (const block of withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const declarations = {};
    for (const declaration of block[2].matchAll(/([\w-]+)\s*:\s*((?:url\("[^"]*"\)|[^;"])+)/g)) {
      declarations[declaration[1]] = declaration[2].trim();
    }
    rules.push({
      selectors: block[1].split(',').map(selector => selector.trim().replace(/\s+/g, ' ')),
      declarations: declarations
    });
  }
  return rules;
}

// The selectors that can match an element with this class in this state.
function matchingSelectors(elementClass, state) {
  const compounds = ['.' + elementClass];
  if (state.approach) compounds.push('.' + elementClass + '[data-approach="' + state.approach + '"]');
  if (state.interaction) compounds.push('.' + elementClass + ':' + state.interaction);
  if (!state.dark) return compounds;
  return compounds.concat(compounds.map(compound => '.' + DARK_THEME_CLASS + ' ' + compound));
}

// Classes, attributes and pseudo-classes all weigh the same, and no selector
// here has an id or element, so a count is the specificity.
function specificity(selector) {
  return (selector.match(/[.[:]/g) || []).length;
}

function resolveProperty(elementClass, state, property) {
  const candidates = matchingSelectors(elementClass, state);
  let winner;
  let winningSpecificity = -1;
  for (const rule of cssRules) {
    if (!(property in rule.declarations)) continue;
    const matched = rule.selectors.filter(selector => candidates.includes(selector));
    if (!matched.length) continue;
    const ruleSpecificity = Math.max.apply(null, matched.map(specificity));
    // A later rule wins a tie, as it does in the browser.
    if (ruleSpecificity >= winningSpecificity) {
      winner = rule.declarations[property];
      winningSpecificity = ruleSpecificity;
    }
  }
  return winner;
}

function hexToRgb(hex) {
  const digits = hex.replace('#', '');
  const fullDigits = digits.length === 3 ? digits.split('').map(digit => digit + digit).join('') : digits;
  return [0, 2, 4].map(offset => parseInt(fullDigits.slice(offset, offset + 2), 16));
}

// The grip's dots are a radial gradient; their colour carries the strength.
function gripAppearance(state) {
  const backgroundImage = resolveProperty(GRIP_CLASS, state, 'background-image');
  if (!backgroundImage) throw new Error('no background-image for the grip');
  const rgba = backgroundImage.match(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/);
  if (rgba) return { rgb: rgba.slice(1, 4).map(Number), strength: Number(rgba[4]) };
  const hex = backgroundImage.match(/radial-gradient\(\s*circle\s*,\s*(#[0-9a-fA-F]{3,6})\b/);
  if (hex) return { rgb: hexToRgb(hex[1]), strength: 1 };
  throw new Error('unrecognised grip colour: ' + backgroundImage);
}

function toggleSvg(state) {
  const backgroundImage = resolveProperty(TOGGLE_CLASS, state, 'background-image');
  if (!backgroundImage) throw new Error('no background-image for the toggle');
  const dataUri = backgroundImage.match(/^url\("([^"]*)"\)$/);
  if (!dataUri) throw new Error('toggle background-image is not a data URI: ' + backgroundImage);
  return dataUri[1];
}

// The toggle is an SVG in a single colour; opacity carries the strength.
function toggleAppearance(state) {
  const svg = decodeURIComponent(toggleSvg(state));
  const colours = new Set(Array.from(svg.matchAll(/(?:stroke|fill)='([^']+)'/g), match => match[1])
    .filter(colour => colour !== 'none'));
  if (colours.size !== 1) throw new Error('expected one toggle colour, found: ' + Array.from(colours).join(', '));
  const opacity = resolveProperty(TOGGLE_CLASS, state, 'opacity');
  return { rgb: hexToRgb(Array.from(colours)[0]), strength: opacity === undefined ? 1 : Number(opacity) };
}

function describeState(state) {
  return [state.approach || 'unrestricted', state.interaction || 'at rest'].join(', ');
}

for (const dark of [false, true]) {
  describe('approach toggle in the ' + (dark ? 'dark' : 'classic') + ' theme', () => {
    for (const approach of APPROACH_STATES) {
      for (const interaction of INTERACTION_STATES) {
        const state = { dark: dark, approach: approach, interaction: interaction };
        test('matches the reorder grip colour and strength (' + describeState(state) + ')', () => {
          expect(toggleAppearance(state)).toEqual(gripAppearance(state));
        });
      }
    }
  });
}

describe('approach toggle shapes', () => {
  test('rests at the grip strength in the classic theme, whatever the approach', () => {
    const restingGripStrength = gripAppearance({ dark: false }).strength;
    expect(restingGripStrength).toBeLessThan(1);
    for (const approach of APPROACH_STATES) {
      expect(toggleAppearance({ dark: false, approach: approach }).strength).toBe(restingGripStrength);
    }
  });

  test('the dark theme recolours each icon without changing its shape', () => {
    for (const approach of APPROACH_STATES) {
      const classicSvg = toggleSvg({ dark: false, approach: approach });
      const darkSvg = toggleSvg({ dark: true, approach: approach });
      expect(darkSvg).not.toBe(classicSvg);
      expect(darkSvg.replace(/%239cb3bb/gi, '%2325487f')).toBe(classicSvg);
    }
  });

  test('the three approaches still differ in shape', () => {
    const svgs = APPROACH_STATES.map(approach => toggleSvg({ dark: true, approach: approach }));
    expect(new Set(svgs).size).toBe(APPROACH_STATES.length);
  });
});
