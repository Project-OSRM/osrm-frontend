#!/bin/sh
set -e

# Default values
OSRM_BACKEND="${OSRM_BACKEND:-http://localhost:5000}"
OSRM_CENTER="${OSRM_CENTER:-38.8995,-77.0269}"
OSRM_ZOOM="${OSRM_ZOOM:-13}"
OSRM_LANGUAGE="${OSRM_LANGUAGE:-en}"
OSRM_DEFAULT_LAYER="${OSRM_DEFAULT_LAYER:-streets}"
OSRM_ENVIRONMENT="${OSRM_ENVIRONMENT:-docker}"
# Empty by default: a self-hosted deployment gets watermarked CARTO tiles until
# it supplies a key of its own.
OSRM_CARTO_KEY="${OSRM_CARTO_KEY:-}"
# Empty by default: only a deployment with its own tile server sets these.
OSRM_TILE_URL="${OSRM_TILE_URL:-}"
OSRM_TILE_NAME="${OSRM_TILE_NAME:-}"
OSRM_TILE_ATTRIBUTION="${OSRM_TILE_ATTRIBUTION:-}"
OSRM_VECTOR_STYLE="${OSRM_VECTOR_STYLE:-}"
OSRM_VECTOR_NAME="${OSRM_VECTOR_NAME:-}"
OSRM_VECTOR_ATTRIBUTION="${OSRM_VECTOR_ATTRIBUTION:-}"
# Empty by default: the frontend then offers the bundled Nominatim instance.
# Set to a JSON array of {"name","url"} to choose the geocoders on offer; an
# entry with an empty url contacts nothing and names waypoints by coordinates.
OSRM_GEOCODERS="${OSRM_GEOCODERS:-}"

# A deployment naming its own tile server usually cannot reach the public
# providers either, so make that layer the default unless the operator picked
# one. "streets" is the image default, so it reads as "not specified" here.
if [ -n "$OSRM_VECTOR_STYLE" ] && [ "$OSRM_DEFAULT_LAYER" = "streets" ]; then
  OSRM_DEFAULT_LAYER=vector
elif [ -n "$OSRM_TILE_URL" ] && [ "$OSRM_DEFAULT_LAYER" = "streets" ]; then
  OSRM_DEFAULT_LAYER=custom
fi

# Validate OSRM_ZOOM is numeric (for valid JSON output)
case "$OSRM_ZOOM" in
  ''|*[!0-9-]*|-) OSRM_ZOOM=13 ;;
esac

# Escape JSON string values (handles backslash, double-quote, and control chars)
# Multi-line input is collapsed to a single line (newlines are stripped).
escape_json() {
  printf '%s' "$1" | awk '{
    gsub(/\\/, "\\\\")
    gsub(/"/, "\\\"")
    gsub(/\t/, "\\t")
    gsub(/\r/, "\\r")
    printf "%s", $0
  }' | tr -d '\n'
}

# Generate the optional same-origin routing proxy. Credentials stay in nginx's
# private configuration and are never written into the public config.json.
PROXY_CONFIG=/etc/nginx/osrm-proxy.conf
if [ -n "${OSRM_PROXY_URL:-}" ]; then
  if ! printf '%s\n' "$OSRM_PROXY_URL" | LC_ALL=C awk '
    NR != 1 || !/^https?:\/\/[A-Za-z0-9.\[\]:-]+(\/[A-Za-z0-9._~%\/-]*)?$/ { bad = 1 }
    END { exit bad }
  '; then
    echo 'Invalid OSRM_PROXY_URL: expected an http(s) backend URL without credentials or a query.' >&2
    exit 1
  fi
  if [ -n "${OSRM_PROXY_PASSWORD:-}" ] && [ -z "${OSRM_PROXY_USERNAME:-}" ]; then
    echo 'OSRM_PROXY_PASSWORD requires OSRM_PROXY_USERNAME.' >&2
    exit 1
  fi
  case "${OSRM_PROXY_USERNAME:-}" in
    *:*) echo 'OSRM_PROXY_USERNAME must not contain a colon.' >&2; exit 1 ;;
  esac
  PROXY_AUTH=''
  if [ -n "${OSRM_PROXY_USERNAME:-}" ]; then
    PROXY_AUTH="Basic $(printf '%s:%s' "$OSRM_PROXY_USERNAME" "${OSRM_PROXY_PASSWORD:-}" | base64 | tr -d '\r\n')"
  fi
  # Restrict the generated file before writing the Authorization header.
  (umask 077; : > "$PROXY_CONFIG")
  chmod 600 "$PROXY_CONFIG"
  cat > "$PROXY_CONFIG" << EOF
location ^~ /osrm/ {
    proxy_pass ${OSRM_PROXY_URL%/}/;
    proxy_set_header Host \$proxy_host;
    proxy_set_header Authorization "$PROXY_AUTH";
    proxy_ssl_server_name on;
    proxy_ssl_verify on;
    proxy_ssl_trusted_certificate /etc/ssl/certs/ca-certificates.crt;
    add_header Cache-Control "no-store" always;
    add_header X-Content-Type-Options "nosniff" always;
}
EOF
  unset PROXY_AUTH
else
  # A container can restart without the proxy settings; remove stale routing
  # configuration so it cannot keep using the previous credentials.
  : > "$PROXY_CONFIG"
fi

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
elif [ -n "${OSRM_PROXY_URL:-}" ]; then
  MODES_JSON='[{"name":"driving","url":"/osrm","profile":"driving"}]'
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
  "OSRM_CARTO_KEY": "$(escape_json "$OSRM_CARTO_KEY")",
  "OSRM_TILE_URL": "$(escape_json "$OSRM_TILE_URL")",
  "OSRM_TILE_NAME": "$(escape_json "$OSRM_TILE_NAME")",
  "OSRM_TILE_ATTRIBUTION": "$(escape_json "$OSRM_TILE_ATTRIBUTION")",
  "OSRM_VECTOR_STYLE": "$(escape_json "$OSRM_VECTOR_STYLE")",
  "OSRM_VECTOR_NAME": "$(escape_json "$OSRM_VECTOR_NAME")",
  "OSRM_VECTOR_ATTRIBUTION": "$(escape_json "$OSRM_VECTOR_ATTRIBUTION")",
  "OSRM_GEOCODERS": "$(escape_json "$OSRM_GEOCODERS")",
  "OSRM_MODES": "$(escape_json "$MODES_JSON")"
}
EOF

# Inject OSRM_ENVIRONMENT into index.html meta tag to signal client to load config.json
if [ -f /usr/share/nginx/html/index.html ]; then
  TMPFILE=$(mktemp) || TMPFILE=""
  if [ -n "$TMPFILE" ]; then
    # Clean up temp file on exit
    trap 'rm -f "$TMPFILE"' EXIT

    awk -v env="$OSRM_ENVIRONMENT" '{
      if ($0 ~ /<meta name="osrm-environment"/) {
        sub(/content="[^"]*"/, "content=\"" env "\"")
      }
      print
    }' /usr/share/nginx/html/index.html > "$TMPFILE" || {
      echo "Warning: failed to inject OSRM_ENVIRONMENT into index.html" >&2
      rm -f "$TMPFILE"
      trap - EXIT
    }

    if [ -f "$TMPFILE" ]; then
      chmod 644 "$TMPFILE" || {
        echo "Warning: chmod failed for $TMPFILE" >&2
        rm -f "$TMPFILE"
        trap - EXIT
      }
    fi

    if [ -f "$TMPFILE" ]; then
      mv "$TMPFILE" /usr/share/nginx/html/index.html || {
        echo "Warning: failed to move $TMPFILE into place" >&2
        rm -f "$TMPFILE"
        trap - EXIT
      }
    fi
  else
    echo "Warning: failed to create temporary file for index.html patch" >&2
  fi
fi

# Execute the default command (nginx) or any command passed to the container
if [ "$#" -eq 0 ]; then
  exec nginx -g "daemon off;"
else
  exec "$@"
fi
