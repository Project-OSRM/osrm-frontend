# Stage 1: build
FROM node:24.18-alpine AS build

# Build-time configuration — override with --build-arg
ARG OSRM_BACKEND=https://router.project-osrm.org
ARG OSRM_CENTER=38.8995,-77.0269
ARG OSRM_ZOOM=13
ARG OSRM_LANGUAGE=en
ARG OSRM_LABEL=Car (fastest)
ARG OSRM_DEFAULT_LAYER=streets

ENV OSRM_BACKEND=$OSRM_BACKEND \
    OSRM_CENTER=$OSRM_CENTER \
    OSRM_ZOOM=$OSRM_ZOOM \
    OSRM_LANGUAGE=$OSRM_LANGUAGE \
    OSRM_LABEL=$OSRM_LABEL \
    OSRM_DEFAULT_LAYER=$OSRM_DEFAULT_LAYER

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# replace.js reads the ENV vars above and patches src/leaflet_options.js before Vite runs
RUN npm run build

# Stage 2: serve
FROM nginx:1.31.2-alpine

# Set runtime environment defaults for entrypoint
# Default OSRM_BACKEND is localhost:5000, which the entrypoint treats as "not specified"
# and falls back to the three public OSRM profiles.
# Override with -e OSRM_BACKEND='http://...' or -e OSRM_MODES='[...]' for a self-hosted server.
ENV OSRM_ENVIRONMENT=docker \
    OSRM_BACKEND=http://localhost:5000 \
    OSRM_CENTER=38.8995,-77.0269 \
    OSRM_ZOOM=13 \
    OSRM_LANGUAGE=en \
    OSRM_LABEL="Car (fastest)" \
    OSRM_DEFAULT_LAYER=streets \
    OSRM_PROFILES=driving,bike,foot

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Vite outputs dist/ with all static assets; copy to nginx web root
COPY --from=build /app/dist/ /usr/share/nginx/html/

EXPOSE 9966
HEALTHCHECK --interval=5s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q -O /dev/null http://localhost:9966/ || exit 1
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
