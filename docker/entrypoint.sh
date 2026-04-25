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

# Load modes from OSRM_MODES env var, file, or use OSRM_BACKEND for backwards compat
MODES_JSON=""

if [ -n "$OSRM_MODES" ]; then
  # Use new OSRM_MODES env var (highest priority)
  MODES_JSON="$OSRM_MODES"
elif [ -f /etc/osrm/modes.json ]; then
  # Fall back to mounted file (allows docker run -v /path/to/modes.json:/etc/osrm/modes.json)
  MODES_JSON=$(cat /etc/osrm/modes.json)
elif [ -n "$OSRM_BACKEND" ] && [ "$OSRM_BACKEND" != "http://localhost:5000" ]; then
  # Backward compatibility: if old OSRM_BACKEND is set to non-default, create single mode
  # User should migrate to OSRM_MODES, but we support this for backward compat
  MODES_JSON=$(cat <<EOF
[
  { "name": "default", "url": "$OSRM_BACKEND" }
]
EOF
)
else
  # Fall back to defaults
  # Docker default: single "default" profile using localhost:5000
  MODES_JSON=$(cat <<'MODES_EOF'
[
  { "name": "default", "url": "http://localhost:5000" }
]
MODES_EOF
)
fi

# Generate config.json with proper JSON escaping
cat > /usr/share/nginx/html/config.json << EOF
{
  "OSRM_BACKEND": "$(escape_json "$OSRM_BACKEND")",
  "OSRM_CENTER": "$(escape_json "$OSRM_CENTER")",
  "OSRM_ZOOM": $OSRM_ZOOM,
  "OSRM_LANGUAGE": "$(escape_json "$OSRM_LANGUAGE")",
  "OSRM_DEFAULT_LAYER": "$(escape_json "$OSRM_DEFAULT_LAYER")",
  "OSRM_ENVIRONMENT": "$(escape_json "$OSRM_ENVIRONMENT")",
  "OSRM_MODES": $(escape_json "$MODES_JSON")
}
EOF

# Execute the default command (nginx) or any command passed to the container
if [ "$#" -eq 0 ]; then
  exec nginx -g "daemon off;"
else
  exec "$@"
fi
