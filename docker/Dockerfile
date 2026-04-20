# Stage 1: build
FROM node:24-alpine AS build

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
# replace.js reads the ENV vars above and patches src/leaflet_options.js before webpack runs
RUN npm run build

# Stage 2: serve
FROM nginx:alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
# Webpack outputs bundle.js to the project root; copy all static assets
COPY --from=build /app/index.html /usr/share/nginx/html/
COPY --from=build /app/favicon.ico /usr/share/nginx/html/
COPY --from=build /app/bundle.js /usr/share/nginx/html/
COPY --from=build /app/bundle.js.LICENSE.txt /usr/share/nginx/html/
COPY --from=build /app/bundle.js.map /usr/share/nginx/html/
COPY --from=build /app/css /usr/share/nginx/html/css
COPY --from=build /app/fonts /usr/share/nginx/html/fonts
COPY --from=build /app/images /usr/share/nginx/html/images
COPY --from=build /app/i18n /usr/share/nginx/html/i18n
COPY --from=build /app/debug /usr/share/nginx/html/debug
EXPOSE 9966
