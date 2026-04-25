#!/bin/sh
set -e

# Default values
OSRM_BACKEND="${OSRM_BACKEND:-https://router.project-osrm.org}"
OSRM_CENTER="${OSRM_CENTER:-38.8995,-77.0269}"
OSRM_ZOOM="${OSRM_ZOOM:-13}"
OSRM_LANGUAGE="${OSRM_LANGUAGE:-en}"
OSRM_LABEL="${OSRM_LABEL:-Car (fastest)}"
OSRM_DEFAULT_LAYER="${OSRM_DEFAULT_LAYER:-streets}"

# Generate config.json from environment variables
cat > /usr/share/nginx/html/config.json << EOF
{
  "OSRM_BACKEND": "$OSRM_BACKEND",
  "OSRM_CENTER": "$OSRM_CENTER",
  "OSRM_ZOOM": $OSRM_ZOOM,
  "OSRM_LANGUAGE": "$OSRM_LANGUAGE",
  "OSRM_LABEL": "$OSRM_LABEL",
  "OSRM_DEFAULT_LAYER": "$OSRM_DEFAULT_LAYER"
}
EOF

# Start nginx
exec nginx -g "daemon off;"
