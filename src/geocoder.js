'use strict';

var L = require('leaflet');
var simplify = require('./simplify');

var geocoder = function(i, num) {
  var container = L.DomUtil.create('div',
      function() {
        if (i === 0) {
          return "osrm-directions-origin";
        } else if (i === num - 1) {
          return "osrm-directions-destination";
        }
        return "osrm-directions-via";
      }()),
    label = L.DomUtil.create('label', 'osrm-form-label', container),
    input = L.DomUtil.create('input', '', container),
    close = L.DomUtil.create('span', 'osrm-directions-icon osrm-close-icon', container),
    name = String.fromCharCode(65 + i),
    icon = L.DomUtil.create('div', 'leaflet-osrm-geocoder-label', label);
  icon.innerHTML = name;
  
  // Disable click propagation on the entire container to prevent any clicks from bubbling to the map
  L.DomEvent.disableClickPropagation(container);
  
  // Also explicitly handle click on the close button
  L.DomEvent.on(close, 'click', function(e) {
    e.stopPropagation();
    e.preventDefault();
  });
  
  return {
    container: container,
    input: input,
    closeButton: close
  };
};

// Matches plain decimal coordinate strings such as "34.129382,-118.141254"
// or "34.129382 -118.141254" (with or without sign, comma or space separator).
// Mirrors the last regex branch in leaflet-control-geocoder's parseLatLng.
var COORD_PATTERN = /^\s*([+-]?\d+(?:\.\d*)?)\s*[\s,]\s*([+-]?\d+(?:\.\d*)?)\s*$/;

function parseCoords(query) {
  var m = query.match(COORD_PATTERN);
  return m ? L.latLng(+m[1], +m[2]) : null;
}

var globalNominatimCache = null;
var liveRegionEl = null;
function announceRateLimit(msg) {
  try {
    if (typeof document === 'undefined') return;
    if (!liveRegionEl) {
      liveRegionEl = document.getElementById('osrm-nominatim-live');
      if (!liveRegionEl) {
        liveRegionEl = document.createElement('div');
        liveRegionEl.id = 'osrm-nominatim-live';
        liveRegionEl.setAttribute('aria-live', 'polite');
        liveRegionEl.style.position = 'absolute';
        liveRegionEl.style.left = '-9999px';
        liveRegionEl.style.width = '1px';
        liveRegionEl.style.height = '1px';
        liveRegionEl.style.overflow = 'hidden';
        document.body.appendChild(liveRegionEl);
      }
    }
    liveRegionEl.textContent = msg;
  } catch (e) {}
}

// Returns a geocoder that, when given coordinate input, preserves the exact
// lat/lon instead of snapping to the nearest address, while still calling
// Nominatim reverse-geocode so a human-readable name is displayed.
// For non-coordinate input, falls through to Nominatim forward-geocode as normal.
// Also bridges leaflet-control-geocoder's Promise API to the callback-based API
// that leaflet-routing-machine's autocomplete expects.
geocoder.coordPreserving = function(nominatimUrl) {
  var nominatim;
  var normalizedNominatimUrl = typeof nominatimUrl === 'string' ? nominatimUrl.trim() : '';
  // Nominatim only reports a place's entrance nodes when asked (`entrances=1`,
  // supported since Nominatim 5.2 on /search and /reverse). Older instances
  // ignore the parameter, so it is safe to send unconditionally.
  var entranceParams = {
    geocodingQueryParams: {entrances: 1},
    reverseQueryParams: {entrances: 1}
  };
  if (normalizedNominatimUrl.length > 0) {
    nominatim = L.Control.Geocoder.nominatim(L.extend({serviceUrl: normalizedNominatimUrl}, entranceParams));
  } else {
    // Preserve Leaflet-Control-Geocoder's default behavior when no URL provided
    nominatim = L.Control.Geocoder.nominatim(L.extend({}, entranceParams));
  }

  // LRU cache persisted to localStorage when available.
  // Evicts entries older than ttl (default 24h) or by LRU when capacity exceeded.
  function createLRUCache(storageKey, maxEntries, ttlMs) {
    var map = new Map();
    var ttl = typeof ttlMs === 'number' ? ttlMs : 24 * 60 * 60 * 1000;

    // Persistence scheduling to avoid synchronous localStorage writes on every cache hit.
    var _persistTimeout = null;
    var _persistDelay = 1000; // ms
    var _warned = Object.create(null);

    function warnOnce(key, msg, err) {
      try {
        if (!_warned[key]) {
          _warned[key] = true;
          console.warn(msg, err);
        }
      } catch (e) {}
    }

    function schedulePersist() {
      try {
        // In test or non-browser environments persist synchronously to keep tests deterministic.
        if (typeof window === 'undefined') {
          persist();
          return;
        }
        if (_persistTimeout) return;
        _persistTimeout = setTimeout(function() {
          _persistTimeout = null;
          try {
            persist();
          } catch (e) {
            warnOnce('persist', 'osrm-cache: persist failed', e);
          }
        }, _persistDelay);
      } catch (e) {}
    }

    // Ensure data flushed on page unload when possible.
    try {
      if (typeof window !== 'undefined' && window && typeof window.addEventListener === 'function') {
        window.addEventListener('beforeunload', function() {
          try {
            if (_persistTimeout) {
              clearTimeout(_persistTimeout);
              _persistTimeout = null;
            }
            persist();
          } catch (e) {}
        });
      }
    } catch (e) {}


    // Normalize cached results to a portable format before JSON serialization.
    // Converts Leaflet LatLng/LatLngBounds objects to plain {lat,lng} / [south,north,west,east]
    // so persistence is decoupled from Leaflet's internal object shape.
    function serializeEntries() {
      return Array.from(map.entries()).map(function(pair) {
        var key = pair[0];
        var entry = pair[1];
        if (!entry || !entry.value || !Array.isArray(entry.value)) return [key, entry];
        return [key, {
          ts: entry.ts,
          value: entry.value.map(function(r) {
            if (!r) return r;
            var out = { name: r.name };
            if (r.center) {
              out.center = { lat: r.center.lat, lng: r.center.lng };
            }
            if (r.bbox) {
              if (typeof r.bbox.getSouthWest === 'function') {
                var sw = r.bbox.getSouthWest();
                var ne = r.bbox.getNorthEast();
                out.bbox = [sw.lat, ne.lat, sw.lng, ne.lng];
              } else if (Array.isArray(r.bbox)) {
                out.bbox = r.bbox;
              } else {
                out.bbox = r.bbox;
              }
            }
            if (r.osmType) out.osmType = r.osmType;
            if (r.osmId !== undefined) out.osmId = r.osmId;
            if (Array.isArray(r.entrances)) {
              out.entrances = r.entrances.map(function(e) {
                var entry = {
                  osmId: e.osmId,
                  type: e.type,
                  center: e.center ? {lat: e.center.lat, lng: e.center.lng} : null
                };
                // Without the tags a cached place silently loses its access
                // rules and would offer doors the mode forbids.
                if (e.tags) entry.tags = e.tags;
                return entry;
              });
            }
            return out;
          })
        }];
      });
    }

    function persist() {
      try {
        if (typeof localStorage !== 'undefined' && localStorage.setItem) {
          localStorage.setItem(storageKey, JSON.stringify(serializeEntries()));
        }
      } catch (e) {
        warnOnce('persist', 'osrm-cache: persist failed', e);
      }
    }

    // Load existing entries, skipping those older than ttl. Rehydrate centers and bboxes to Leaflet objects when possible.
    try {
      if (typeof localStorage !== 'undefined' && localStorage.getItem) {
        var raw = localStorage.getItem(storageKey);
        if (raw) {
          var entries = JSON.parse(raw);
          if (Array.isArray(entries)) {
            var now = Date.now();
            entries.forEach(function(pair) {
              try {
                var k = pair[0];
                var obj = pair[1];
                if (!obj || typeof obj.ts !== 'number') return;
                if (now - obj.ts > ttl) return;
                // Rehydrate value array items (center and bbox) to Leaflet types when possible
                if (obj.value && Array.isArray(obj.value)) {
                  obj.value.forEach(function(r) {
                    try {
                      // rehydrate center -> L.latLng if necessary
                      if (r && r.center && r.center.lat !== undefined && r.center.lng !== undefined) {
                        if (!(r.center && typeof r.center.toBounds === 'function')) {
                          r.center = L.latLng(r.center.lat, r.center.lng);
                        }
                      }
                      // rehydrate entrance centers -> L.latLng
                      if (r && Array.isArray(r.entrances)) {
                        r.entrances.forEach(function(e) {
                          if (e && e.center && e.center.lat !== undefined && e.center.lng !== undefined) {
                            e.center = L.latLng(e.center.lat, e.center.lng);
                          }
                        });
                      }
                      // rehydrate bbox -> L.latLngBounds when possible
                      if (r && r.bbox) {
                        // Canonical format: array [south, north, west, east]
                        if (Array.isArray(r.bbox) && r.bbox.length === 4) {
                          r.bbox = L.latLngBounds(
                            L.latLng(parseFloat(r.bbox[0]), parseFloat(r.bbox[2])),
                            L.latLng(parseFloat(r.bbox[1]), parseFloat(r.bbox[3]))
                          );
                        } else if (r.bbox._southWest && r.bbox._northEast) {
                          // Migration: Leaflet's LatLngBounds serialised shape from older cache versions.
                          // Will be re-persisted in canonical array format on next persist().
                          try {
                            r.bbox = L.latLngBounds(
                              L.latLng(parseFloat(r.bbox._southWest.lat), parseFloat(r.bbox._southWest.lng)),
                              L.latLng(parseFloat(r.bbox._northEast.lat), parseFloat(r.bbox._northEast.lng))
                            );
                          } catch (e) {}
                        } else if (r.bbox.south !== undefined && r.bbox.north !== undefined && r.bbox.west !== undefined && r.bbox.east !== undefined) {
                          // Migration: custom object shape from older cache versions.
                          try {
                            r.bbox = L.latLngBounds(
                              L.latLng(parseFloat(r.bbox.south), parseFloat(r.bbox.west)),
                              L.latLng(parseFloat(r.bbox.north), parseFloat(r.bbox.east))
                            );
                          } catch (e) {}
                        }
                      }
                    } catch (e) {}
                  });
                }
                map.set(k, obj);
              } catch (e) {}
            });
            // Enforce maxEntries after load in case the limit was lowered between versions
            while (map.size > maxEntries) {
              map.delete(map.keys().next().value);
            }
          }
        }
      }
    } catch (e) {
      warnOnce('load', 'osrm-cache: failed to load from localStorage', e);
    }

    function removeExpired() {
      try {
        var now = Date.now();
        var changed = false;
        for (var it = map.entries(), res = it.next(); !res.done; res = it.next()) {
          var key = res.value[0];
          var entry = res.value[1];
          if (!entry || typeof entry.ts !== 'number' || now - entry.ts > ttl) {
            map.delete(key);
            changed = true;
          }
        }
        if (changed) schedulePersist();
      } catch (e) {
        warnOnce('removeExpired', 'osrm-cache: removeExpired failed', e);
      }
    }

    return {
      get: function(key) {
        if (!map.has(key)) return null;
        var entry = map.get(key);
        if (!entry) return null;
        // Check TTL for this specific entry instead of scanning the whole map
        if (typeof entry.ts !== 'number' || Date.now() - entry.ts > ttl) {
          map.delete(key);
          schedulePersist();
          return null;
        }
        // Move to most-recently-used position and refresh timestamp (sliding TTL)
        map.delete(key);
        entry.ts = Date.now();
        map.set(key, entry);
        schedulePersist();
        return entry.value;
      },
      set: function(key, value) {
        removeExpired();
        var entry = { value: value, ts: Date.now() };
        if (map.has(key)) map.delete(key);
        map.set(key, entry);
        while (map.size > maxEntries) {
          var firstKey = map.keys().next().value;
          map.delete(firstKey);
        }
        schedulePersist();
      }
    };
  }

  if (!globalNominatimCache) globalNominatimCache = createLRUCache('osrm_nominatim_cache_v2', 128, 24 * 60 * 60 * 1000);
  var cache = globalNominatimCache;
  var supportsFetch = typeof fetch === 'function';
  var serviceBase = (normalizedNominatimUrl && normalizedNominatimUrl.length > 0) ? normalizedNominatimUrl.replace(/\/+$/, '') + '/' : 'https://nominatim.openstreetmap.org/';

  // Place outlines are fetched one at a time, only when something is actually
  // about to draw one. They deliberately do not ride along on search: `suggest`
  // runs on every keystroke, and a polygon per result would multiply a payload
  // that is almost always discarded. Kept in memory only — the persisted result
  // cache has a fixed shape that geometry has no place in.
  var outlineCache = {};

  var OSM_TYPE_PREFIX = {node: 'N', way: 'W', relation: 'R'};

  // Backstop against a pathological relation. Ordinary places are governed by
  // visual negligibility instead and never come near this.
  var MAX_OUTLINE_POINTS_PER_RING = 2000;

  function buildLookupUrl(osmType, osmId) {
    var prefix = OSM_TYPE_PREFIX[String(osmType).toLowerCase()];
    if (!prefix) return null;
    // The full outline is requested and thinned here instead of via Nominatim's
    // polygon_threshold, whose tolerance is an absolute number of degrees: a
    // value large enough to thin a 5 km airport also flattens a 170 m building
    // into a few stray corners. See simplifyOutline below.
    return serviceBase + 'lookup?format=json&polygon_geojson=1' +
      '&osm_ids=' + prefix + encodeURIComponent(osmId);
  }

  // Thins the outline without changing how it looks: Visvalingam–Whyatt drops
  // vertices in order of the area they contribute and stops as soon as the
  // smallest survivor would be visible at the scale the picker draws the place.
  // A building keeps every corner that reads as a corner; only redundant
  // vertices go.
  function simplifyOutline(geometry) {
    return simplify.simplifyGeometry(geometry, {maxPoints: MAX_OUTLINE_POINTS_PER_RING});
  }

  // Resolves to the place's GeoJSON outline, or null when it has none (a node),
  // when the endpoint is an older Nominatim, or when the request fails. Callers
  // treat a missing outline as "just don't draw one".
  function fetchOutline(result) {
    if (!result || result.osmType === undefined || result.osmId === undefined) {
      return Promise.resolve(null);
    }
    var url = buildLookupUrl(result.osmType, result.osmId);
    if (!url) return Promise.resolve(null);
    if (Object.prototype.hasOwnProperty.call(outlineCache, url)) {
      return Promise.resolve(outlineCache[url]);
    }
    if (!supportsFetch) return Promise.resolve(null);
    return fetch(url, {headers: {'Accept': 'application/json'}}).then(function(resp) {
      if (!resp.ok) return null;
      return resp.json();
    }).then(function(json) {
      var geometry = Array.isArray(json) && json[0] ? json[0].geojson : null;
      // Only areas are worth outlining; a node's outline is the point itself.
      if (!geometry || (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon')) {
        geometry = null;
      } else {
        geometry = simplifyOutline(geometry);
      }
      outlineCache[url] = geometry;
      return geometry;
    }).catch(function() {
      return null;
    });
  }

  function setInputBgFromContext(context, color) {
    try {
      if (!context) return;
      var input = null;
      if (context.input && context.input.style) input = context.input;
      else if (context._input && context._input.style) input = context._input;
      else if (context.container && context.container.querySelector) input = context.container.querySelector('input');
      else if (context.querySelector) input = context.querySelector('input');
      if (input && input.style) input.style.backgroundColor = color;
    } catch (e) {}
  }

  function buildSearchUrl(query) {
    return serviceBase + 'search?format=json&addressdetails=1&entrances=1&limit=5&q=' + encodeURIComponent(query);
  }

  function buildReverseUrl(latlng, scale) {
    var lat = (latlng && latlng.lat) || (latlng && latlng[0]) || 0;
    var lon = (latlng && latlng.lng) || (latlng && latlng[1]) || 0;
    // Derive a zoom level from the provided `scale` when possible. Accept either
    // a Leaflet scale (e.g., 256 * 2^zoom) or a direct zoom value.
    var zoom = 18;
    try {
      if (typeof scale === 'number' && !isNaN(scale)) {
        if (scale > 30) {
          // Likely a pixel scale like 256 * 2^zoom — invert to get zoom
          zoom = Math.round(Math.log2(scale / 256));
        } else {
          // Likely already a zoom level
          zoom = Math.round(scale);
        }
      }
    } catch (e) {}
    zoom = Math.max(0, Math.min(18, zoom));
    return serviceBase + 'reverse?format=json&addressdetails=1&entrances=1&lat=' + encodeURIComponent(lat) + '&lon=' + encodeURIComponent(lon) + '&zoom=' + encodeURIComponent(zoom);
  }

  // Normalizes Nominatim's `entrances` array into the shape the rest of the app
  // uses. Returns null rather than an empty array so callers can treat "no
  // entrance data" and "place has no entrances" identically.
  //
  // `tags` is the entrance node's own tag set, which Nominatim returns as
  // `extratags` without being asked for it. It carries the OSM access keys —
  // `access`, `foot`, `bicycle`, `motor_vehicle` — that say which modes may use
  // a door, so it has to survive as far as the picker.
  function parseEntrances(raw) {
    if (!Array.isArray(raw)) return null;
    var entrances = [];
    raw.forEach(function(e) {
      if (!e) return;
      var lat = parseFloat(e.lat);
      var lon = parseFloat(e.lon);
      if (isNaN(lat) || isNaN(lon)) return;
      var parsed = {
        osmId: e.osm_id,
        type: typeof e.type === 'string' ? e.type : 'yes',
        center: L.latLng(lat, lon)
      };
      if (e.extratags && typeof e.extratags === 'object') parsed.tags = e.extratags;
      entrances.push(parsed);
    });
    return entrances.length ? entrances : null;
  }

  // Lifts entrances out of the raw Nominatim payload that
  // leaflet-control-geocoder preserves on `properties`. Used for the
  // nominatim.geocode()/reverse() path, which maps results to {name, bbox,
  // center, properties} and would otherwise drop the entrance list.
  function attachPlaceDetails(results) {
    if (!Array.isArray(results)) return results;
    return results.map(function(r) {
      if (!r || !r.properties) return r;
      var extra = {};
      if (!r.entrances) {
        var entrances = parseEntrances(r.properties.entrances);
        if (entrances) extra.entrances = entrances;
      }
      if (r.osmType === undefined && r.properties.osm_type) extra.osmType = r.properties.osm_type;
      if (r.osmId === undefined && r.properties.osm_id !== undefined) extra.osmId = r.properties.osm_id;
      return Object.keys(extra).length ? L.extend({}, r, extra) : r;
    });
  }

  function parseSearchResults(json) {
    if (!Array.isArray(json)) return [];
    return json.map(function(r) {
      var bbox = null;
      try {
        if (r.boundingbox && r.boundingbox.length === 4) {
          bbox = L.latLngBounds(
            L.latLng(parseFloat(r.boundingbox[0]), parseFloat(r.boundingbox[2])),
            L.latLng(parseFloat(r.boundingbox[1]), parseFloat(r.boundingbox[3]))
          );
        }
      } catch (e) {}
      var result = {
        name: r.display_name || r.name || '',
        bbox: bbox,
        center: L.latLng(parseFloat(r.lat), parseFloat(r.lon))
      };
      var entrances = parseEntrances(r.entrances);
      if (entrances) result.entrances = entrances;
      if (r.osm_type) result.osmType = r.osm_type;
      if (r.osm_id !== undefined) result.osmId = r.osm_id;
      return result;
    });
  }

  function doSearch(query, context) {
    var url = buildSearchUrl(query);
    var cached = cache.get(url);
    if (cached) {
      setInputBgFromContext(context, 'white');
      return Promise.resolve(cached);
    }

    function fetchSearch() {
      return fetch(url, { headers: { 'Accept': 'application/json' } }).then(function(resp) {
        if (resp.status === 429) {
          setInputBgFromContext(context, 'orange');
          announceRateLimit('Geocoder rate-limited (HTTP 429)');
          return [];
        }
        if (!resp.ok) {
          setInputBgFromContext(context, '');
          return [];
        }
        return resp.json().then(function(json) {
          var results = parseSearchResults(json);
          cache.set(url, results);
          setInputBgFromContext(context, 'white');
          return results;
        }).catch(function() {
          setInputBgFromContext(context, '');
          return [];
        });
      }).catch(function() {
        setInputBgFromContext(context, '');
        return [];
      });
    }

    // Prefer using nominatim.geocode when available (helps tests that mock it).
    if (nominatim && typeof nominatim.geocode === 'function') {
      return nominatim.geocode(query).then(function(rawResults) {
        var results = attachPlaceDetails(rawResults);
        try {
          cache.set(url, results);
        } catch (e) {}
        setInputBgFromContext(context, 'white');
        return results;
      }).catch(function(err) {
        if (err && err.status === 429) {
          setInputBgFromContext(context, 'orange');
          announceRateLimit('Geocoder rate-limited (HTTP 429)');
          return [];
        }
        // fall back to fetch path when available
        if (supportsFetch) return fetchSearch();
        return [];
      });
    }

    if (supportsFetch) {
      return fetchSearch();
    }

    // no fetch and no nominatim: give up with empty result
    return Promise.resolve([]);
  }

  function doReverse(latlng, scale, context) {
    // Wrap longitude into [-180, 180] so Nominatim receives valid coordinates
    // when the map has been scrolled past the antimeridian (issues #206, #307).
    var latlngWrapped = (latlng && typeof latlng.wrap === 'function') ? latlng.wrap() : latlng;
    // Offset to re-project result centers back into the same "world copy" as
    // the original latlng, so LRM's geocoder-element distance-tolerance check
    // (rs[0].center.distanceTo(wp.latLng)) passes correctly.
    var lngOffset = (latlng && latlngWrapped) ? latlng.lng - latlngWrapped.lng : 0;
    var url = buildReverseUrl(latlngWrapped, scale);
    var cached = cache.get(url);
    var basePromise;
    if (cached) {
      setInputBgFromContext(context, 'white');
      basePromise = Promise.resolve(cached);
    } else if (nominatim && typeof nominatim.reverse === 'function') {
      basePromise = nominatim.reverse(latlngWrapped, scale).then(function(rawResults) {
        var results = attachPlaceDetails(rawResults);
        try {
          cache.set(url, results);
        } catch (e) {}
        setInputBgFromContext(context, 'white');
        return results;
      }).catch(function(err) {
        if (err && err.status === 429) {
          setInputBgFromContext(context, 'orange');
          announceRateLimit('Geocoder rate-limited (HTTP 429)');
        } else {
          setInputBgFromContext(context, '');
        }
        return [];
      });
    } else if (supportsFetch) {
      basePromise = fetch(url, { headers: { 'Accept': 'application/json' } }).then(function(resp) {
        if (resp.status === 429) {
          setInputBgFromContext(context, 'orange');
          announceRateLimit('Geocoder rate-limited (HTTP 429)');
          return [];
        }
        if (!resp.ok) {
          setInputBgFromContext(context, '');
          return [];
        }
        return resp.json().then(function(json) {
          var bbox = null;
          try {
            if (json.boundingbox && json.boundingbox.length === 4) {
              bbox = L.latLngBounds(
                L.latLng(parseFloat(json.boundingbox[0]), parseFloat(json.boundingbox[2])),
                L.latLng(parseFloat(json.boundingbox[1]), parseFloat(json.boundingbox[3]))
              );
            }
          } catch (e) {}
          var reverseResult = {
            name: json.display_name || json.name || '',
            bbox: bbox,
            center: L.latLng(parseFloat(json.lat), parseFloat(json.lon))
          };
          var reverseEntrances = parseEntrances(json.entrances);
          if (reverseEntrances) reverseResult.entrances = reverseEntrances;
          if (json.osm_type) reverseResult.osmType = json.osm_type;
          if (json.osm_id !== undefined) reverseResult.osmId = json.osm_id;
          var res = [reverseResult];
          cache.set(url, res);
          setInputBgFromContext(context, 'white');
          return res;
        }).catch(function() {
          setInputBgFromContext(context, '');
          return [];
        });
      }).catch(function() {
        setInputBgFromContext(context, '');
        return [];
      });
    } else {
      basePromise = Promise.resolve([]);
    }

    if (lngOffset === 0) return basePromise;
    return basePromise.then(function(results) {
      if (!results || !results.length) return results;
      return results.map(function(r) {
        if (!r || !r.center) return r;
        return Object.assign({}, r, { center: L.latLng(r.center.lat, r.center.lng + lngOffset) });
      });
    });
  }

  // Helper: reverse-geocodes coordinates for display name, but preserves exact latlng.
  function coordResult(latlng, query, context) {
    // Use scale corresponding to zoom level 18 (was hard-coded as 256 * 2^18 = 67108864)
    return doReverse(latlng, L.CRS.EPSG3857.scale(18), context).then(function(results) {
      if (results && results.length > 0) {
        var coordMatch = L.extend({}, results[0], {
          center: latlng,
          bbox: latlng.toBounds(1000)
        });
        // A typed coordinate means "exactly here"; offering the entrances of
        // whatever place happens to surround it would move the waypoint away
        // from the point the user asked for.
        delete coordMatch.entrances;
        return [coordMatch];
      }
      return [{ name: query, center: latlng, bbox: latlng.toBounds(1000) }];
    }).catch(function() {
      return [{ name: query, center: latlng, bbox: latlng.toBounds(1000) }];
    });
  }

  return {
    geocode: function(query, cb, context) {
      var latlng = parseCoords(query);
      if (latlng) {
        return coordResult(latlng, query, context).then(function(results) {
          if (typeof cb === 'function') cb.call(context, results);
          return results;
        }).catch(function() {
          var fallback = [];
          if (typeof cb === 'function') cb.call(context, fallback);
          return fallback;
        });
      }
      return doSearch(query, context).then(function(results) {
        if (typeof cb === 'function') cb.call(context, results);
        return results;
      });
    },

    suggest: function(query, cb, context) {
      var latlng = parseCoords(query);
      if (latlng) {
        // Coordinate input: return result with exact center so the
        // auto-selected dropdown item preserves the typed location.
        return coordResult(latlng, query, context).then(function(results) {
          if (typeof cb === 'function') cb.call(context, results);
          return results;
        });
      }
      return doSearch(query, context).then(function(results) {
        if (typeof cb === 'function') cb.call(context, results);
        return results;
      });
    },

    fetchOutline: fetchOutline,

    reverse: function(latlng, scale, cb, context) {
      return doReverse(latlng, scale, context).then(function(results) {
        if (typeof cb === 'function') cb.call(context, results);
        return results;
      });
    }
  };
};

// Replacement for LRM's built-in waypointNameFallback that wraps the longitude
// into [-180, 180] before formatting. When reverse geocoding fails (no network,
// rate limit, location in the ocean) and the raw coordinate is shown, this
// ensures the displayed value is always within the valid geographic range.
geocoder.wrappedWaypointNameFallback = function(latLng) {
  var wrapped = (latLng && typeof latLng.wrap === 'function') ? latLng.wrap() : latLng;
  var ll = wrapped || latLng || {};
  var ns = (ll.lat || 0) < 0 ? 'S' : 'N';
  var ew = (ll.lng || 0) < 0 ? 'W' : 'E';
  var lat = (Math.round(Math.abs(ll.lat || 0) * 10000) / 10000).toString();
  var lng = (Math.round(Math.abs(ll.lng || 0) * 10000) / 10000).toString();
  return ns + lat + ', ' + ew + lng;
};

module.exports = geocoder;
