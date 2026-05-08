/**
 * @jest-environment jsdom
 */
"use strict";

var modeSelector = require("../src/mode_selector");

describe("Mode selector localization", function () {
  it("updates profile labels and title when language changes", function () {
    var profiles = [
      { label: "Car", labelKey: "Car" },
      { label: "Bike", labelKey: "Bike" },
      { label: "Foot", labelKey: "Foot" },
    ];

    var selector = modeSelector.createModeSelector(
      {
        "Select profile": "Select profile",
        Car: "Car",
        Bike: "Bike",
        Foot: "Foot",
      },
      profiles,
    );

    selector.updateLocalization({
      "Select profile": "Profil waehlen",
      Car: "Auto",
      Bike: "Fahrrad",
      Foot: "Zu Fuss",
    });

    expect(selector.select.title).toBe("Profil waehlen");
    expect(selector.select.options[0].textContent).toBe("Auto");
    expect(selector.select.options[1].textContent).toBe("Fahrrad");
    expect(selector.select.options[2].textContent).toBe("Zu Fuss");
  });
});
