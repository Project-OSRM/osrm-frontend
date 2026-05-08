"use strict";

// Mock leaflet and leaflet-routing-machine so tests run in Node without a DOM.
// The latLng mock includes wrap() so _formatCoord's wrapping logic is exercised.
jest.mock("leaflet", () => ({
  latLng: function (lat, lng) {
    var obj = { lat: lat, lng: lng };
    obj.wrap = function () {
      // Inline Leaflet's wrapNum(lng, [-180, 180], true) without referencing
      // out-of-scope variables (jest.mock hoisting restriction).
      var v = obj.lng;
      var wrapped = ((((v + 180) % 360) + 360) % 360) - 180;
      return { lat: obj.lat, lng: wrapped };
    };
    return obj;
  },
  Routing: {
    waypoint: function (latlng, name) {
      return { latLng: latlng, name: name || "" };
    },
  },
}));
jest.mock("jsonp", () => {});

const links = require("../src/links");

describe("links.parse — dst/src address parameters", () => {
  test("parses ?dst into destinationAddress", () => {
    const result = links.parse("dst=Berlin");
    expect(result.destinationAddress).toBe("Berlin");
  });

  test("parses ?src into originAddress", () => {
    const result = links.parse("src=Paris");
    expect(result.originAddress).toBe("Paris");
  });

  test("parses both ?src and ?dst together", () => {
    const result = links.parse("src=Paris&dst=Berlin");
    expect(result.originAddress).toBe("Paris");
    expect(result.destinationAddress).toBe("Berlin");
  });

  test("parses address strings with spaces and special characters", () => {
    const result = links.parse("dst=New%20York%2C%20NY");
    expect(result.destinationAddress).toBe("New York, NY");
  });

  test("returns undefined originAddress when src is absent", () => {
    const result = links.parse("dst=Berlin");
    expect(result.originAddress).toBeUndefined();
  });

  test("returns undefined destinationAddress when dst is absent", () => {
    const result = links.parse("src=Paris");
    expect(result.destinationAddress).toBeUndefined();
  });

  test("dst/src absent from result when empty string", () => {
    const result = links.parse("dst=&src=");
    // Empty strings are filtered out by the existing options filtering logic
    expect(result.destinationAddress).toBeUndefined();
    expect(result.originAddress).toBeUndefined();
  });
});

describe("links.format — dst/src are not serialized", () => {
  test("formatLink does not include dst in output", () => {
    const L = require("leaflet");
    const output = links.format({
      zoom: 13,
      center: L.latLng(52.5, 13.4),
      waypoints: [],
      language: "en",
      destinationAddress: "Berlin",
      originAddress: "Paris",
    });
    expect(output).not.toContain("dst=");
    expect(output).not.toContain("src=");
  });
});

describe("links.parse — existing loc= params still work", () => {
  test("parses loc= coordinate pairs normally", () => {
    const result = links.parse("loc=52.5,13.4&loc=48.8,2.3");
    expect(result.waypoints).toHaveLength(2);
    expect(result.waypoints[0].latLng.lat).toBeCloseTo(52.5);
    expect(result.waypoints[1].latLng.lat).toBeCloseTo(48.8);
  });

  test("dst and src are parsed alongside loc= without conflict", () => {
    const result = links.parse("loc=52.5,13.4&loc=48.8,2.3&dst=Lyon");
    expect(result.waypoints).toHaveLength(2);
    expect(result.destinationAddress).toBe("Lyon");
  });
});

describe("links.format — coordinate wrapping (issues #206, #307)", () => {
  const L = require("leaflet");

  test("wraps waypoint longitude < -180 when formatting", () => {
    // Simulates panning west past antimeridian: London scrolled to -360-2.8 = -362.8 degrees
    const output = links.format({
      zoom: 9,
      center: L.latLng(51.5, 13.4),
      waypoints: [
        { latLng: L.latLng(53.265, -362.806) },
        { latLng: L.latLng(51.43, -360.203) },
      ],
      language: "en",
      alternative: 0,
    });
    expect(output).toContain("loc=53.265000%2C-2.806000");
    expect(output).toContain("loc=51.430000%2C-0.203000");
    expect(output).not.toMatch(/loc=.*-3[56]\d/);
  });

  test("wraps waypoint longitude > +360 when formatting", () => {
    // Issue #206: panning east many times produces very large longitudes
    const output = links.format({
      zoom: 9,
      center: L.latLng(39.9, 1556.6),
      waypoints: [
        { latLng: L.latLng(39.899, 1556.241) },
        { latLng: L.latLng(39.918, 1556.612) },
      ],
      language: "en",
      alternative: 0,
    });
    // 1556.241 mod 360 = 116.241 (1556.241 - 4*360 = 116.241)
    expect(output).toContain("loc=39.899000%2C116.241000");
    expect(output).toContain("loc=39.918000%2C116.612000");
    expect(output).not.toContain("1556");
  });

  test("wraps center longitude when formatting", () => {
    const output = links.format({
      zoom: 9,
      center: L.latLng(51.5, -362.8),
      waypoints: [],
      language: "en",
      alternative: 0,
    });
    expect(output).toContain("center=51.500000%2C-2.800000");
    expect(output).not.toContain("-362");
  });

  test("does not alter coordinates already in [-180, 180]", () => {
    const output = links.format({
      zoom: 13,
      center: L.latLng(52.5, 13.4),
      waypoints: [{ latLng: L.latLng(48.8, 2.3) }],
      language: "en",
      alternative: 0,
    });
    expect(output).toContain("center=52.500000%2C13.400000");
    expect(output).toContain("loc=48.800000%2C2.300000");
  });
});
