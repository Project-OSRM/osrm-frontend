/**
 * @jest-environment jsdom
 */

"use strict";

function createLeafletMock(includeEvented) {
  function Evented() {}
  Evented.prototype = {
    on: function (type, handler) {
      this._events = this._events || {};
      this._events[type] = this._events[type] || [];
      this._events[type].push(handler);
      return this;
    },
    fire: function (type, event) {
      var handlers = (this._events && this._events[type]) || [];
      handlers.forEach(function (handler) {
        handler.call(this, event);
      }, this);
      return this;
    },
  };

  function Control() {}

  Control.extend = function (props) {
    function Extended() {
      this.options = Object.assign({}, props.options);
      if (props.initialize) {
        props.initialize.apply(this, arguments);
      }
    }

    Extended.prototype = Object.assign({}, props.includes || {}, props);
    delete Extended.prototype.includes;
    return Extended;
  };

  var leaflet = {
    Control: Control,
    Mixin: { Events: Evented.prototype },
    DomUtil: {
      create: function (tagName, className, container) {
        var element = document.createElement(tagName);
        if (className) {
          element.className = className;
        }
        if (container) {
          container.appendChild(element);
        }
        return element;
      },
      addClass: function (element, className) {
        element.classList.add(className);
      },
      removeClass: function (element, className) {
        element.classList.remove(className);
      },
      hasClass: function (element, className) {
        return element.classList.contains(className);
      },
    },
    DomEvent: {
      on: function (element, type, handler, context) {
        element.addEventListener(
          type,
          context ? handler.bind(context) : handler,
        );
      },
      disableClickPropagation: function () {},
      stopPropagation: function (event) {
        event.stopPropagation();
      },
    },
    setOptions: function (target, options) {
      target.options = Object.assign(target.options || {}, options);
    },
  };

  if (includeEvented) {
    leaflet.Evented = Evented;
  }

  return leaflet;
}

function loadTools(includeEvented, shortlinkMock) {
  jest.resetModules();
  jest.doMock("leaflet", function () {
    return createLeafletMock(includeEvented !== false);
  });
  jest.doMock("../src/shortlink", function () {
    return shortlinkMock || { osmli: jest.fn() };
  });
  return require("../src/tools");
}

describe("tools debug map link", () => {
  let tools;
  let control;
  let openSpy;

  beforeEach(() => {
    tools = loadTools();
    control = tools.control({}, {}, {});
    control._map = {
      getCenter: function () {
        return { lat: 38.8995, lng: -77.0269 };
      },
      getZoom: function () {
        return 13;
      },
    };
    openSpy = jest.spyOn(window, "open").mockImplementation(function () {});
  });

  afterEach(() => {
    if (openSpy) {
      openSpy.mockRestore();
    }
  });

  test("opens the debug map on the current frontend origin", () => {
    window.history.replaceState({}, "", "/?z=13");

    control._openDebug();

    expect(openSpy).toHaveBeenCalledWith(
      "http://localhost/debug/#13/38.899500/-77.026900",
    );
  });

  test("preserves a frontend subpath when opening the debug map", () => {
    window.history.replaceState({}, "", "/osrm-frontend/index.html?z=13");

    control._openDebug();

    expect(openSpy).toHaveBeenCalledWith(
      "http://localhost/osrm-frontend/debug/#13/38.899500/-77.026900",
    );
  });

  test("keeps the Leaflet event API on the control", () => {
    var handler = jest.fn();

    control.on("languagechanged", handler);
    control.fire("languagechanged", { language: "en" });

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ language: "en" }),
    );
  });

  test("falls back to Mixin.Events when Evented is unavailable", () => {
    var fallbackTools = loadTools(false);
    var fallbackControl = fallbackTools.control({}, {}, {});
    var handler = jest.fn();

    fallbackControl.on("languagechanged", handler);
    fallbackControl.fire("languagechanged", { language: "en" });

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ language: "en" }),
    );
  });
});

describe("tools share popup", () => {
  let shortlinkMock;
  let tools;
  let control;
  let container;

  beforeEach(() => {
    shortlinkMock = {
      osmli: jest.fn(function (url, callback) {
        callback("https://osm.li/test");
      }),
    };
    tools = loadTools(true, shortlinkMock);
    control = tools.control(
      {
        "Share Route": "Share Route",
        Link: "Link",
        Shortlink: "Shortlink",
        "Select language": "Select language",
        Build: "Build: ",
      },
      {},
      {
        shareButtonClass: "osrm-share-icon",
      },
    );
    container = control.onAdd();
  });

  test("shows the current URL in the share popup by default", () => {
    var shareButton = container.querySelector(".osrm-share-icon");

    window.history.replaceState({}, "", "/?z=13");
    shareButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(shortlinkMock.osmli).not.toHaveBeenCalled();
    expect(container.querySelector(".share-url").value).toBe(
      "http://localhost/?z=13",
    );
  });

  test("switches to a shortlink and closes when the overlay is clicked", async () => {
    var shareButton = container.querySelector(".osrm-share-icon");
    var shortlinkButton;
    var overlay;

    window.history.replaceState({}, "", "/?z=13");
    shareButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    shortlinkButton = container.querySelectorAll(".share-type")[1];
    shortlinkButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(shortlinkMock.osmli).toHaveBeenCalledWith(
      "http://localhost/?z=13",
      expect.any(Function),
    );
    expect(container.querySelector(".share-url").value).toBe(
      "https://osm.li/test",
    );

    overlay = container.querySelector(".share-overlay");
    overlay.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise(function (resolve) {
      window.setTimeout(resolve, 0);
    });

    expect(container.querySelector(".share-url")).toBeNull();
  });
});
