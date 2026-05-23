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
  # Default: use the three public OSRM profiles (same as non-Docker mode).
  # Override with OSRM_MODES or OSRM_BACKEND to point at a self-hosted server.
  MODES_JSON='[{"name":"driving","url":"https://router.project-osrm.org","path":"https://router.project-osrm.org/route/v1","profile":"driving"},{"name":"bike","url":"https://routing.openstreetmap.de","path":"https://routing.openstreetmap.de/routed-bike/route/v1","profile":"bike"},{"name":"foot","url":"https://routing.openstreetmap.de","path":"https://routing.openstreetmap.de/routed-foot/route/v1","profile":"foot"}]'
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

# Inject OSRM_ENVIRONMENT into index.html meta tag to signal client to load config.json
if [ -f /usr/share/nginx/html/index.html ]; then
  TMPFILE=$(mktemp) || {
    echo "Warning: failed to create temporary file for index.html patch" >&2
    TMPFILE=""
  }
  if [ -n "$TMPFILE" ]; then
    if awk -v env="$OSRM_ENVIRONMENT" '{
      if ($0 ~ /<meta name="osrm-environment"/) {
        sub(/content="[^"]*"/, "content=\"" env "\"")
      }
      print
    }' /usr/share/nginx/html/index.html > "$TMPFILE"; then
      if ! chmod 644 "$TMPFILE"; then
        echo "Warning: chmod failed for $TMPFILE" >&2
        rm -f "$TMPFILE"
      elif ! mv "$TMPFILE" /usr/share/nginx/html/index.html; then
        echo "Warning: failed to move $TMPFILE into place" >&2
        rm -f "$TMPFILE"
      fi
    else
      echo "Warning: failed to inject OSRM_ENVIRONMENT into index.html" >&2
      rm -f "$TMPFILE"
    fi
  fi
fi

# Execute the default command (nginx) or any command passed to the container
if [ "$#" -eq 0 ]; then
  exec nginx -g "daemon off;"
else
  exec "$@"
fi
