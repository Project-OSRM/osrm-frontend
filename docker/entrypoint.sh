#!/bin/sh
set -e

# Default values
OSRM_BACKEND="${OSRM_BACKEND:-http://localhost:5000}"
OSRM_CENTER="${OSRM_CENTER:-38.8995,-77.0269}"
OSRM_ZOOM="${OSRM_ZOOM:-13}"
OSRM_LANGUAGE="${OSRM_LANGUAGE:-en}"
OSRM_DEFAULT_LAYER="${OSRM_DEFAULT_LAYER:-streets}"
OSRM_ENVIRONMENT="${OSRM_ENVIRONMENT:-docker}"

# Validate OSRM_ZOOM is numeric (for valid JSON output)
case "$OSRM_ZOOM" in
  ''|*[!0-9-]*|-) OSRM_ZOOM=13 ;;
esac

# Escape JSON string values (handle quotes, newlines, backslashes)
escape_json() {
  printf '%s\n' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g; s/$/\\/' | tr -d '\n' | sed 's/\\$//'
}

# Load routing modes from the preferred OSRM_MODES config.
# OSRM_BACKEND is deprecated and only kept as a single-backend fallback.
MODES_JSON=""
CONFIG_BACKEND=""

if [ -n "$OSRM_MODES" ]; then
  # Use the JSON-based mode configuration directly.
  MODES_JSON="$OSRM_MODES"
  if [ "$OSRM_BACKEND" != "http://localhost:5000" ]; then
    CONFIG_BACKEND="$OSRM_BACKEND"
  fi
elif [ -f /etc/osrm/modes.json ]; then
  # Fall back to a mounted JSON file with the same shape as OSRM_MODES.
  MODES_JSON=$(cat /etc/osrm/modes.json)
  if [ "$OSRM_BACKEND" != "http://localhost:5000" ]; then
    CONFIG_BACKEND="$OSRM_BACKEND"
  fi
elif [ -n "$OSRM_BACKEND" ] && [ "$OSRM_BACKEND" != "http://localhost:5000" ]; then
  # Backward compatibility: a non-default OSRM_BACKEND means one deprecated single backend.
  CONFIG_BACKEND="$OSRM_BACKEND"
else
  # With no runtime override, keep the Docker default:
  # one profile named "default" pointing at http://localhost:5000.
  MODES_JSON=""
fi

# Generate config.json with proper JSON escaping
cat > /usr/share/nginx/html/config.json << EOF
{
  "OSRM_BACKEND": "$(escape_json "$CONFIG_BACKEND")",
  "OSRM_CENTER": "$(escape_json "$OSRM_CENTER")",
  "OSRM_ZOOM": $OSRM_ZOOM,
  "OSRM_LANGUAGE": "$(escape_json "$OSRM_LANGUAGE")",
  "OSRM_DEFAULT_LAYER": "$(escape_json "$OSRM_DEFAULT_LAYER")",
  "OSRM_ENVIRONMENT": "$(escape_json "$OSRM_ENVIRONMENT")",
  "OSRM_MODES": "$(escape_json "$MODES_JSON")"
}
EOF

# Execute the default command (nginx) or any command passed to the container
if [ "$#" -eq 0 ]; then
  exec nginx -g "daemon off;"
else
  exec "$@"
fi
