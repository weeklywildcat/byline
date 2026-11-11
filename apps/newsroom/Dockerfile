# ENGINE_DIR is where the engine sits in the build context: "." when building
# this repository, "byline" when a publication repository pins it as a submodule.
# BYLINE_SITE is the site's directory, relative to the context root.
ARG ENGINE_DIR=.
ARG BYLINE_SITE=sites/default

# Collect the workspace root's manifest and lock, and every workspace manifest
# (found by glob, so a new package or site needs no edit here), at their own paths.
# This stage reruns on any source change, but its output only changes with a
# manifest, so the npm ci layer below stays cached for source-only changes.
FROM node:24.22.1-bookworm-slim AS manifests
ARG ENGINE_DIR
ARG BYLINE_SITE
WORKDIR /src
COPY . .
RUN set -eu; mkdir -p /manifests; \
    for file in package.json package-lock.json "$ENGINE_DIR"/apps/*/package.json "$ENGINE_DIR"/packages/*/package.json "$ENGINE_DIR"/sites/*/package.json "$BYLINE_SITE"/package.json; do \
      [ -f "$file" ] || continue; mkdir -p "/manifests/$(dirname "$file")"; cp "$file" "/manifests/$file"; \
    done

FROM node:24.22.1-bookworm-slim
ARG ENGINE_DIR
ARG BYLINE_SITE

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1 BYLINE_ROOT=/app BYLINE_SITE=${BYLINE_SITE}

# Keep dependency installation in its own cacheable layer. Normal source-only
# deploys should not re-run npm ci; changing package-lock.json or any workspace
# manifest intentionally invalidates this layer.
COPY --from=manifests /manifests/ ./

RUN --mount=type=cache,target=/root/.npm npm ci

COPY . .

# Link @byline/site to the selected site. Only its `config` and `preview` entries are bundled.
RUN node ${ENGINE_DIR}/scripts/select-site.mjs

EXPOSE 3010
