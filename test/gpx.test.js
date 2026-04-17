/**
 * @jest-environment jsdom
 */

'use strict';

const buildGPX = require('../src/gpx');

const SAMPLE_ROUTE = {
  properties: {
    name: 'Test Route',
    copyright: {
      author: 'OpenStreetMap contributors',
      license: 'http://www.openstreetmap.org/copyright'
    },
    link: {
      href: 'http://example.com/route',
      text: 'Example Route'
    },
    time: '2024-01-01T00:00:00.000Z'
  },
  geometry: {
    type: 'LineString',
    coordinates: [
      [-77.0269, 38.8995],
      [-77.0300, 38.9010],
      [-77.0350, 38.9050]
    ]
  }
};

describe('buildGPX', () => {
  let result;

  beforeEach(() => {
    result = buildGPX(SAMPLE_ROUTE);
  });

  describe('GPX envelope', () => {
    test('declares the GPX 1.1 namespace', () => {
      expect(result).toContain('xmlns="http://www.topografix.com/GPX/1/1"');
    });

    test('declares the XSI namespace', () => {
      expect(result).toContain('xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"');
    });

    test('includes the schema location', () => {
      expect(result).toContain('xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd"');
    });

    test('sets creator to osrm', () => {
      expect(result).toContain('creator="osrm"');
    });

    test('sets version to 1.1', () => {
      expect(result).toContain('version="1.1"');
    });
  });

  describe('metadata', () => {
    test('includes the route name', () => {
      expect(result).toContain('<name>Test Route</name>');
    });

    test('includes the copyright author attribute', () => {
      expect(result).toContain('author="OpenStreetMap contributors"');
    });

    test('includes the license URL', () => {
      expect(result).toContain('<license>http://www.openstreetmap.org/copyright</license>');
    });

    test('includes the link href attribute', () => {
      expect(result).toContain('href="http://example.com/route"');
    });

    test('includes the link text', () => {
      expect(result).toContain('<text>Example Route</text>');
    });

    test('includes the timestamp', () => {
      expect(result).toContain('<time>2024-01-01T00:00:00.000Z</time>');
    });
  });

  describe('track points', () => {
    test('wraps points in trk > trkseg', () => {
      expect(result).toContain('<trk>');
      expect(result).toContain('<trkseg>');
    });

    test('outputs correct number of trkpt elements', () => {
      const matches = result.match(/<trkpt /g);
      expect(matches).toHaveLength(3);
    });

    test('first point has correct lat and lon', () => {
      expect(result).toContain('lat="38.8995"');
      expect(result).toContain('lon="-77.0269"');
    });

    test('uses lat for latitude (not lng)', () => {
      // coordinates are [lng, lat] in GeoJSON — must be swapped to lat/lon in GPX
      expect(result).not.toContain('lat="-77.0269"');
    });

    test('includes all coordinates', () => {
      expect(result).toContain('lat="38.901"');
      expect(result).toContain('lat="38.905"');
    });
  });

  describe('XML correctness', () => {
    test('is parseable XML', () => {
      const parser = new DOMParser();
      const doc = parser.parseFromString(result, 'application/xml');
      const parseError = doc.querySelector('parsererror');
      expect(parseError).toBeNull();
    });

    test('root element is gpx', () => {
      const parser = new DOMParser();
      const doc = parser.parseFromString(result, 'application/xml');
      expect(doc.documentElement.tagName).toBe('gpx');
    });

    test('escapes special characters in text content', () => {
      const routeWithSpecialChars = JSON.parse(JSON.stringify(SAMPLE_ROUTE));
      routeWithSpecialChars.properties.name = 'Route <A> & "B"';
      const xml = buildGPX(routeWithSpecialChars);
      // Should be entity-encoded, not raw < > & "
      expect(xml).not.toContain('<name>Route <A>');
      const parser = new DOMParser();
      const doc = parser.parseFromString(xml, 'application/xml');
      expect(doc.querySelector('name').textContent).toBe('Route <A> & "B"');
    });
  });

  describe('empty name fallback', () => {
    test('uses empty string when name is undefined', () => {
      const routeNoName = JSON.parse(JSON.stringify(SAMPLE_ROUTE));
      delete routeNoName.properties.name;
      const xml = buildGPX(routeNoName);
      expect(xml).toContain('<name/>');
    });
  });
});
