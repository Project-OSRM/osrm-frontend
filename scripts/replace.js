#!/usr/bin/env node

'use strict'

const fs = require('fs')
const path = require('path')

function applyReplacements(content, env) {
  const ZOOM = env.OSRM_ZOOM || 13
  const LABEL = env.OSRM_LABEL || 'Car (fastest)'
  const CENTER = env.OSRM_CENTER || '38.8995, -77.0269'
  const BACKEND = env.OSRM_BACKEND || 'https://router.project-osrm.org'
  const LANGUAGE = env.OSRM_LANGUAGE || 'en'
  const DEFAULT_LAYER = env.OSRM_DEFAULT_LAYER || 'streets'

  let options = content

  if (BACKEND) options = options.replace(/http[s]?:\/\/router\.project-osrm\.org/, BACKEND)
  if (LABEL) options = options.replace('Car (fastest)', LABEL)
  if (ZOOM) options = options.replace('zoom: 13', `zoom: ${ZOOM}`)
  if (LANGUAGE) options = options.replace(`language: 'en'`, `language: '${LANGUAGE}'`)
  if (DEFAULT_LAYER) options = options.replace('layer: streets', `layer: ${DEFAULT_LAYER}`)
  if (CENTER) {
    const latLng = CENTER.split(/[, ]+/)
    const lat = latLng[0]
    const lng = latLng[1]
    const lnglat = [lng, lat].join(',')
    const latlng = [lat, lng].join(',')

    // debug/index.html uses LngLat (GL format)
    if (options.match('-122.44315266116867')) options = options.replace('-122.44315266116867,\n        37.78238285747459', `${lng},\n        ${lat}`)
    // Also update the map center in the Map constructor
    if (options.match('-77.0269,38.8995')) options = options.replace('-77.0269,38.8995', lnglat)
    // Leaflet uses LatLng
    else options = options.replace('38.8995,-77.0269', latlng)
  }

  return options
}

// Only run file I/O when executed directly as a script
if (require.main === module) {
  const leafletOptions = path.join(__dirname, '..', 'src', 'leaflet_options.js')
  const debug = path.join(__dirname, '..', 'debug', 'index.html')

  for (const filepath of [leafletOptions, debug]) {
    const content = fs.readFileSync(filepath, 'utf8')
    fs.writeFileSync(filepath, applyReplacements(content, process.env))
  }
}

module.exports = { applyReplacements }
