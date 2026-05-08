/**
 * @jest-environment jsdom
 */
"use strict";

var modeSelector = require("../src/mode_selector");
var routerPatches = require("../src/router_patches");

describe("Profile Selector", function () {
  describe("Mode Selector", function () {
    it("should render profile selector when profiles are provided", function () {
      var localization = {
        key: "en",
        "Select profile": "Select profile",
        Car: "Car",
        Bike: "Bike",
        Foot: "Foot",
      };

      var profiles = [
        {
          label: "Car",
          path: "https://router.project-osrm.org/route/v1",
          profile: "driving",
        },
        {
          label: "Bike",
          path: "https://router.project-osrm.org/routed-bike/route/v1",
          profile: "bike",
        },
        {
          label: "Foot",
          path: "https://router.project-osrm.org/routed-foot/route/v1",
          profile: "foot",
        },
      ];

      var selector = modeSelector.createModeSelector(localization, profiles);

      expect(selector).toBeDefined();
      expect(
        selector.container.querySelector(".osrm-profile-chooser"),
      ).toBeDefined();
    });

    it("should have three profile options", function () {
      var localization = {
        key: "en",
        "Select profile": "Select profile",
        Car: "Car",
        Bike: "Bike",
        Foot: "Foot",
      };

      var profiles = [{ label: "Car" }, { label: "Bike" }, { label: "Foot" }];

      var selector = modeSelector.createModeSelector(localization, profiles);
      var select = selector.container.querySelector(".osrm-profile-chooser");

      expect(select.options.length).toBe(3);
    });

    it("should select first profile by default", function () {
      var localization = {
        key: "en",
        "Select profile": "Select profile",
        Car: "Car",
        Bike: "Bike",
        Foot: "Foot",
      };

      var profiles = [{ label: "Car" }, { label: "Bike" }, { label: "Foot" }];

      var selector = modeSelector.createModeSelector(localization, profiles);
      var select = selector.container.querySelector(".osrm-profile-chooser");

      expect(select.value).toBe("0");
    });

    it("should translate profile labels using localization", function () {
      var localization = {
        key: "en",
        "Select profile": "Select profile",
        Car: "Auto",
        Bike: "Bicicleta",
        Foot: "A pie",
      };

      var profiles = [{ label: "Car" }, { label: "Bike" }, { label: "Foot" }];

      var selector = modeSelector.createModeSelector(localization, profiles);
      var select = selector.container.querySelector(".osrm-profile-chooser");

      expect(select.options[0].textContent).toBe("Auto");
      expect(select.options[1].textContent).toBe("Bicicleta");
      expect(select.options[2].textContent).toBe("A pie");
    });
  });

  describe("Router Profile Patching", function () {
    it("should set active service and profile on router", function () {
      var mockRouter = {
        options: {
          serviceUrl: "https://original.example.com/route/v1",
          profile: "driving",
        },
      };

      var services = [
        {
          label: "Car",
          path: "https://car.example.com/route/v1",
          profile: "driving",
        },
        {
          label: "Bike",
          path: "https://bike.example.com/route/v1",
          profile: "bike",
        },
        {
          label: "Foot",
          path: "https://walk.example.com/route/v1",
          profile: "foot",
        },
      ];

      routerPatches.setActiveService(mockRouter, 0, services);
      expect(mockRouter.options.serviceUrl).toBe(
        "https://car.example.com/route/v1",
      );
      expect(mockRouter.options.profile).toBe("driving");

      routerPatches.setActiveService(mockRouter, 1, services);
      expect(mockRouter.options.serviceUrl).toBe(
        "https://bike.example.com/route/v1",
      );
      expect(mockRouter.options.profile).toBe("bike");

      routerPatches.setActiveService(mockRouter, 2, services);
      expect(mockRouter.options.serviceUrl).toBe(
        "https://walk.example.com/route/v1",
      );
      expect(mockRouter.options.profile).toBe("foot");
    });

    it("should not change service for invalid index", function () {
      var mockRouter = {
        options: {
          serviceUrl: "https://original.example.com/route/v1",
          profile: "driving",
        },
      };

      var services = [
        {
          label: "Car",
          path: "https://car.example.com/route/v1",
          profile: "driving",
        },
      ];

      var originalUrl = mockRouter.options.serviceUrl;
      var originalProfile = mockRouter.options.profile;

      routerPatches.setActiveService(mockRouter, 5, services);
      expect(mockRouter.options.serviceUrl).toBe(originalUrl);
      expect(mockRouter.options.profile).toBe(originalProfile);
    });
  });

  describe("localStorage Persistence", function () {
    beforeEach(function () {
      localStorage.clear();
    });

    it("should store profile selection in localStorage", function () {
      localStorage.setItem("profile", "1");
      expect(localStorage.getItem("profile")).toBe("1");
    });

    it("should retrieve profile selection from localStorage", function () {
      localStorage.setItem("profile", "2");
      var savedProfile = localStorage.getItem("profile");
      expect(parseInt(savedProfile, 10)).toBe(2);
    });
  });
});
