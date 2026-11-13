/**
 * @jest-environment jsdom
 */
'use strict';

var modeSelector = require('../src/mode_selector');

describe('Mode selector localization', function() {
  it('updates profile labels and title when language changes', function() {
    var profiles = [
      { label: 'Car', labelKey: 'Car' },
      { label: 'Bike', labelKey: 'Bike' },
      { label: 'Foot', labelKey: 'Foot' }
    ];

    var selector = modeSelector.createModeSelector({
      'Select profile': 'Select profile',
      'Car': 'Car',
      'Bike': 'Bike',
      'Foot': 'Foot'
    }, profiles);

    selector.updateLocalization({
      'Select profile': 'Profil waehlen',
      'Car': 'Auto',
      'Bike': 'Fahrrad',
      'Foot': 'Zu Fuss'
    });

    expect(selector.select.title).toBe('Profil waehlen');
    expect(selector.select.options[0].textContent).toBe('Auto');
    expect(selector.select.options[1].textContent).toBe('Fahrrad');
    expect(selector.select.options[2].textContent).toBe('Zu Fuss');
  });
});

describe('Profile buttons (issue #335)', () => {
  const profiles = [
    { label: 'Car', profile: 'driving' },
    { label: 'Bike', profile: 'bike' },
    { label: 'Foot', profile: 'foot' }
  ];

  test('shows one named native button per profile with decorative icons', () => {
    const selector = modeSelector.createModeSelector({}, profiles);
    const buttons = selector.container.querySelectorAll('button');
    expect(buttons).toHaveLength(3);
    expect(Array.from(buttons, button => button.getAttribute('aria-label'))).toEqual(['Car', 'Bike', 'Foot']);
    expect(selector.container.querySelectorAll('svg')).toHaveLength(3);
    expect(buttons[0].getAttribute('aria-pressed')).toBe('true');
    expect(selector.select.hidden).toBe(true);
    expect(selector.select.tabIndex).toBe(-1);
  });

  test('a click selects the backend and emits exactly one existing change event', () => {
    const selector = modeSelector.createModeSelector({}, profiles);
    const changed = jest.fn();
    selector.select.addEventListener('change', changed);
    const buttons = selector.container.querySelectorAll('button');
    buttons[1].click();
    expect(selector.select.value).toBe('1');
    expect(buttons[1].getAttribute('aria-pressed')).toBe('true');
    expect(buttons[0].getAttribute('aria-pressed')).toBe('false');
    buttons[1].click();
    expect(changed).toHaveBeenCalledTimes(1);
  });

  test('restoring a profile updates the buttons without emitting a user change', () => {
    const selector = modeSelector.createModeSelector({}, profiles);
    const changed = jest.fn();
    selector.select.addEventListener('change', changed);
    selector.setValue(2);
    expect(selector.select.value).toBe('2');
    expect(selector.container.querySelectorAll('button')[2].getAttribute('aria-pressed')).toBe('true');
    expect(changed).not.toHaveBeenCalled();
  });

  test('localizes buttons and preserves custom backend names safely', () => {
    const selector = modeSelector.createModeSelector({}, [
      { label: 'Car', profile: 'driving' },
      { label: '<Truck>', profile: 'truck' }
    ]);
    selector.updateLocalization({ 'Car': 'Auto', 'Select profile': 'Profil wählen' });
    expect(selector.container.getAttribute('aria-label')).toBe('Profil wählen');
    const buttons = selector.container.querySelectorAll('button');
    expect(buttons[0].getAttribute('aria-label')).toBe('Auto');
    expect(buttons[1].textContent).toBe('<Truck>');
    expect(buttons[1].querySelector('truck')).toBeNull();
    expect(modeSelector.createModeSelector({}, [])).toBeNull();
  });
});
