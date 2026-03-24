'use strict';

function buildGPX(routeGeoJSON) {
  var props = routeGeoJSON.properties;
  var coords = routeGeoJSON.geometry.coordinates;
  var doc = document.implementation.createDocument(
    'http://www.topografix.com/GPX/1/1', 'gpx', null
  );
  var gpx = doc.documentElement;
  gpx.setAttribute('xmlns:xsi', 'http://www.w3.org/2001/XMLSchema-instance');
  gpx.setAttribute('xsi:schemaLocation', 'http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd');
  gpx.setAttribute('creator', 'osrm');
  gpx.setAttribute('version', '1.1');

  var GPX_NS = 'http://www.topografix.com/GPX/1/1';

  function el(tag, text) {
    var e = doc.createElementNS(GPX_NS, tag);
    if (text !== undefined) e.textContent = text;
    return e;
  }

  var metadata = el('metadata');
  metadata.appendChild(el('name', props.name || ''));
  var copyright = el('copyright');
  copyright.setAttribute('author', props.copyright.author);
  copyright.appendChild(el('license', props.copyright.license));
  metadata.appendChild(copyright);
  var link = el('link');
  link.setAttribute('href', props.link.href);
  link.appendChild(el('text', props.link.text));
  metadata.appendChild(link);
  metadata.appendChild(el('time', props.time));
  gpx.appendChild(metadata);

  var trk = el('trk');
  var trkseg = el('trkseg');
  coords.forEach(function(coord) {
    var trkpt = el('trkpt');
    trkpt.setAttribute('lat', coord[1]);
    trkpt.setAttribute('lon', coord[0]);
    trkseg.appendChild(trkpt);
  });
  trk.appendChild(trkseg);
  gpx.appendChild(trk);

  return new XMLSerializer().serializeToString(doc);
}

module.exports = buildGPX;
