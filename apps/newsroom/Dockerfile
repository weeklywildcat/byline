# syntax=docker/dockerfile:1.7
FROM node:24.22.1-bookworm-slim

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

# Keep dependency installation in its own cacheable layer. Normal source-only
# deploys should not re-run npm ci; changing package-lock.json or any workspace
# manifest intentionally invalidates this layer.
# ENGINE_DIR is where the engine sits in the build context: "." when building
# this repository, "byline" when a publication repository pins it as a submodule.
# BYLINE_SITE is the site's directory, relative to the context root.
ARG ENGINE_DIR=.
ARG BYLINE_SITE=sites/default
ENV BYLINE_ROOT=/app BYLINE_SITE=${BYLINE_SITE}

# The workspace root's manifest and lock, then every workspace manifest, found by
# glob so a new package or site needs no edit here. --parents (Dockerfile 1.7)
# keeps each manifest at its own path.
COPY package.json package-lock.json ./
COPY --parents ${ENGINE_DIR}/apps/*/package.json ${ENGINE_DIR}/packages/*/package.json ${ENGINE_DIR}/sites/*/package.json ${BYLINE_SITE}/package.json ./

RUN --mount=type=cache,target=/root/.npm npm ci

COPY . .

# Link @byline/site to the selected site. Only its `config` and `preview` entries are bundled.
RUN node ${ENGINE_DIR}/scripts/select-site.mjs

EXPOSE 3010
