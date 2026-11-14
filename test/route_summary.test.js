/**
 * @jest-environment jsdom
 */
'use strict';
const routeSummary = require('../src/route_summary');

test('renders duration, distance and road names in a route card', () => {
  const container = document.createElement('div');
  container.innerHTML = routeSummary({ time: '14 min', distance: '5.8 mi', name: 'Main Street' });
  expect(container.querySelector('.osrm-route-time').textContent).toBe('14 min');
  expect(container.querySelector('.osrm-route-distance').textContent).toBe('5.8 mi');
  expect(container.querySelector('.osrm-route-name').textContent).toBe('Main Street');
});

test('treats all route and formatter strings as text rather than HTML', () => {
  const container = document.createElement('div');
  container.innerHTML = routeSummary({ time: '<b>14 min</b>', distance: 'A&B', name: '<img src=x onerror=alert(1)>' });
  expect(container.querySelector('img')).toBeNull();
  expect(container.querySelector('.osrm-route-name').textContent).toBe('<img src=x onerror=alert(1)>');
  expect(container.querySelector('.osrm-route-time').textContent).toBe('<b>14 min</b>');
  expect(container.querySelector('.osrm-route-distance').textContent).toBe('A&B');
});
