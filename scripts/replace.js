#!/usr/bin/env node

const fs = require('fs')
const path = require('path')

// Define filepaths
const leafletOptions = path.join(__dirname, '..', 'src', 'leaflet_options.js')
const debug = path.join(__dirname, '..', 'debug', 'index.html')

// Read & Replace options
for (const filepath of [leafletOptions, debug]) {
  let options = fs.readFileSync(filepath, 'utf8')

  // Define Environment variables
  const ZOOM = process.env.ZOOM
  const LABEL = process.env.LABEL
  const CENTER = process.env.CENTER
  const BACKEND = process.env.BACKEND
  const LANGUAGE = process.env.LANGUAGE

  // Edit Leaflet Options
  if (BACKEND) options = options.replace(/http[s]?:\/\/router\.project-osrm\.org/, BACKEND)
  if (LABEL) options = options.replace('Car (fastest)', LABEL)
  if (ZOOM) options = options.replace('zoom: 13', `zoom: ${ZOOM}`)
  if (LANGUAGE) options = options.replace(`language: 'en'`, `language: '${LANGUAGE}'`)
  if (CENTER) {
    const [lat, lng] = CENTER.split(/[, ]+/)
    const lnglat = [lng, lat].join(',')
    const latlng = [lat, lng].join(',')

    // Mapbox uses LngLat
    if (options.match('-122.4536, 37.796')) options = options.replace('-122.4536, 37.796', lnglat)
    // Leaflet uses LatLng
    else options = options.replace('38.8995, -77.0269', latlng)
  }

  // Save Leaflet Options
  fs.writeFileSync(filepath, options)
}
