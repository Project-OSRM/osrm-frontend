#!/bin/sh
set -e

# Default values
OSRM_BACKEND="${OSRM_BACKEND:-http://localhost:5000}"
OSRM_BACKEND_DRIVING="${OSRM_BACKEND_DRIVING:-$OSRM_BACKEND}"
OSRM_BACKEND_BIKE="${OSRM_BACKEND_BIKE:-$OSRM_BACKEND}"
OSRM_BACKEND_FOOT="${OSRM_BACKEND_FOOT:-$OSRM_BACKEND}"
OSRM_CENTER="${OSRM_CENTER:-38.8995,-77.0269}"
OSRM_ZOOM="${OSRM_ZOOM:-13}"
OSRM_LANGUAGE="${OSRM_LANGUAGE:-en}"
OSRM_LABEL="${OSRM_LABEL:-Car (fastest)}"
OSRM_DEFAULT_LAYER="${OSRM_DEFAULT_LAYER:-streets}"
OSRM_PROFILES="${OSRM_PROFILES:-driving,bike,foot}"
OSRM_ENVIRONMENT="${OSRM_ENVIRONMENT:-docker}"

# Validate OSRM_ZOOM is numeric (for valid JSON output)
case "$OSRM_ZOOM" in
  ''|*[!0-9-]*|-) OSRM_ZOOM=13 ;;
esac

# Escape JSON string values (handle quotes, newlines, backslashes)
escape_json() {
  printf '%s\n' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g; s/$/\\/' | tr -d '\n' | sed 's/\\$//'
}

# Generate config.json with proper JSON escaping
cat > /usr/share/nginx/html/config.json << EOF
{
  "OSRM_BACKEND": "$(escape_json "$OSRM_BACKEND")",
  "OSRM_BACKEND_DRIVING": "$(escape_json "$OSRM_BACKEND_DRIVING")",
  "OSRM_BACKEND_BIKE": "$(escape_json "$OSRM_BACKEND_BIKE")",
  "OSRM_BACKEND_FOOT": "$(escape_json "$OSRM_BACKEND_FOOT")",
  "OSRM_CENTER": "$(escape_json "$OSRM_CENTER")",
  "OSRM_ZOOM": $OSRM_ZOOM,
  "OSRM_LANGUAGE": "$(escape_json "$OSRM_LANGUAGE")",
  "OSRM_LABEL": "$(escape_json "$OSRM_LABEL")",
  "OSRM_DEFAULT_LAYER": "$(escape_json "$OSRM_DEFAULT_LAYER")",
  "OSRM_PROFILES": "$(escape_json "$OSRM_PROFILES")",
  "OSRM_ENVIRONMENT": "$(escape_json "$OSRM_ENVIRONMENT")"
}
EOF

# Execute the default command (nginx) or any command passed to the container
if [ "$#" -eq 0 ]; then
  exec nginx -g "daemon off;"
else
  exec "$@"
fi
