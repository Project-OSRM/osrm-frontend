/** @jest-environment jsdom */

var edition = require('../src/map_edition');
var EventEmitter = require('node:events');

test('switches editions with ordered stops, the fractional view and routing options', function() {
  var search = 'loc=50,8&loc=&loc=51,9&z=14.625&center=50.3,8.2&alt=1&profile=2&hl=de&scale=imperial&exclude=ferry&u=true&ly=Outdoors';
  var target = new URL(edition.switchUrl('https://maps.example/new/', search, 'default', 'new'));
  expect(target.pathname).toBe('/new/');
  expect(target.searchParams.getAll('loc')).toEqual(['50,8', '', '51,9']);
  expect(Object.fromEntries(target.searchParams)).toMatchObject({
    z: '14.625', center: '50.3,8.2', alt: '1', profile: '2', hl: 'de',
    scale: 'imperial', exclude: 'ferry', u: 'true', view: 'keep'
  });
  expect(target.searchParams.has('ly')).toBe(false);
});

test.each(['18.125', '19.625', '20'])('clamps classic and restores vector zoom %s on return', function(zoom) {
  var search = 'z=' + zoom + '&center=50.3,8.2&loc=50,8&loc=51,9&profile=2';
  var classic = new URL(edition.switchUrl('https://maps.example/', search, 'false', 'classic'));
  expect(classic.searchParams.get('z')).toBe('18');
  expect(classic.searchParams.get('vz')).toBe(zoom);

  // Panning in classic keeps the new center and the saved vector zoom.
  classic.searchParams.set('center', '50.4,8.3');
  var vector = new URL(edition.switchUrl('https://maps.example/new/', classic.search, 'default', 'new'));
  expect(vector.searchParams.get('z')).toBe(zoom);
  expect(vector.searchParams.get('center')).toBe('50.4,8.3');
  expect(vector.searchParams.getAll('loc')).toEqual(['50,8', '51,9']);
  expect(vector.searchParams.get('profile')).toBe('2');
  expect(vector.searchParams.get('view')).toBe('keep');
  expect(vector.searchParams.has('vz')).toBe(false);
});

test('carries the approaches to classic and back to the new edition', function() {
  var search = 'z=15&center=50.3,8.2&loc=50,8&loc=&loc=51,9&ap=curb%3B%3Bopposite';
  var classic = new URL(edition.switchUrl('https://maps.example/', search, 'false', 'classic'));
  expect(classic.searchParams.get('ap')).toBe('curb;;opposite');
  expect(classic.searchParams.getAll('loc')).toEqual(['50,8', '', '51,9']);
  var vector = new URL(edition.switchUrl('https://maps.example/new/', classic.search, 'default', 'new'));
  expect(vector.searchParams.get('ap')).toBe('curb;;opposite');
  expect(vector.searchParams.getAll('loc')).toEqual(['50,8', '', '51,9']);
});

test('honors a lower zoom chosen in classic', function() {
  var vector = new URL(edition.switchUrl('https://maps.example/new/', 'z=16.5&vz=20', 'default', 'new'));
  expect(vector.searchParams.get('z')).toBe('16.5');
  expect(vector.searchParams.has('vz')).toBe(false);
});

test.each(['NaN', 'Infinity', '18', '17', '19-invalid'])('ignores an invalid saved vector zoom %s', function(zoom) {
  var vector = new URL(edition.switchUrl('https://maps.example/new/', 'z=18&vz=' + zoom, 'default', 'new'));
  expect(vector.searchParams.get('z')).toBe('18');
  expect(vector.searchParams.has('vz')).toBe(false);
});

test.each(['default', 'false'])('carries the outgoing U-turn policy %s', function(policy) {
  var target = new URL(edition.switchUrl('https://maps.example/', 'z=15&center=50,8', policy));
  expect(target.searchParams.get('u')).toBe(policy);
});

test('uses the latest state and language through a regular reciprocal link', function() {
  document.head.innerHTML = '<meta name="osrm-map-switch" content="../" data-edition="classic" data-host="maps.example">';
  document.body.innerHTML = '';
  var current = { language: 'en', zoom: 13 };
  var location = new URL('https://maps.example/preview/new/');
  var refresh = edition.attach(document, location, function() { return current; }, function(state) {
    return 'z=' + state.zoom;
  }, 'false');
  var link = document.querySelector('.osrm-edition-switch');
  expect(refresh).toBeInstanceOf(Function);
  expect(link.textContent).toBe('Back to the classic demo site');
  current = { language: 'de', zoom: 14.625 };
  link.dispatchEvent(new Event('contextmenu'));
  expect(link.textContent).toBe('Zurück zur klassischen Demo');
  expect(link.href).toBe('https://maps.example/preview/?z=14.625&u=false&view=keep');
});

test('labels the opt-in switch as the new demo site', function() {
  document.head.innerHTML = '<meta name="osrm-map-switch" content="new/" data-edition="new">';
  document.body.innerHTML = '';
  var location = new URL('https://maps.example/preview/');
  edition.attach(document, location, function() { return { language: 'en' }; }, function() { return ''; }, 'default');
  var link = document.querySelector('.osrm-edition-switch');
  expect(link.textContent).toBe('Try the new demo site');
  expect(new URL(link.href).pathname).toBe('/preview/new/');
});

test('requires an opt-in link and restricts it to the configured host and origin', function() {
  var location = new URL('https://maps.example/');
  document.head.innerHTML = '<meta name="osrm-map-switch" content="/new/" data-edition="new" data-host="other.example">';
  expect(edition.attach(document, location)).toBeNull();
  document.head.innerHTML = '<meta name="osrm-map-switch" content="https://other.example/new/" data-edition="new">';
  expect(edition.attach(document, location)).toBeNull();
  document.head.innerHTML = '';
  expect(edition.attach(document, location)).toBeNull();
});

test('preserves the loaded view only on the first route', function() {
  var keep = edition.holdInitialView(true, new EventEmitter(), new EventEmitter());
  expect(keep()).toBe(true);
  expect(keep()).toBe(false);
  expect(edition.holdInitialView(false)()).toBe(false);
});

test.each(['waypointschanged', 'routingerror'])('cancels initial view preservation on %s', function(event) {
  var plan = new EventEmitter();
  var routing = new EventEmitter();
  var keep = edition.holdInitialView(true, plan, routing);
  (event === 'waypointschanged' ? plan : routing).emit(event);
  expect(keep()).toBe(false);
  expect(plan.listenerCount('waypointschanged')).toBe(0);
  expect(routing.listenerCount('routingerror')).toBe(0);
});
