FROM node:24.22.1-bookworm-slim

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

# Keep dependency installation in its own cacheable layer. Normal source-only
# builds should not re-run npm ci; changing package-lock.json or any workspace
# manifest intentionally invalidates this layer.
COPY package.json package-lock.json ./
COPY apps/newsroom/package.json ./apps/newsroom/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/admin-runtime/package.json ./packages/admin-runtime/package.json
COPY packages/article-body/package.json ./packages/article-body/package.json
COPY packages/content/package.json ./packages/content/package.json
COPY packages/core/package.json ./packages/core/package.json
COPY packages/data/package.json ./packages/data/package.json
COPY packages/data-presentations/package.json ./packages/data-presentations/package.json
COPY packages/design/package.json ./packages/design/package.json
COPY packages/editor/package.json ./packages/editor/package.json
COPY packages/newsroom-screens/package.json ./packages/newsroom-screens/package.json
COPY packages/newsroom-ui/package.json ./packages/newsroom-ui/package.json
COPY packages/story-presentations/package.json ./packages/story-presentations/package.json
COPY packages/theme-contract/package.json ./packages/theme-contract/package.json
COPY packages/theme-weekly-wildcat/package.json ./packages/theme-weekly-wildcat/package.json
COPY packages/ui/package.json ./packages/ui/package.json

RUN --mount=type=cache,target=/root/.npm npm ci

COPY . .

# Production images carry the compiled Next/Payload server. The build directory
# deliberately lives outside .next because the existing production Compose
# project mounts a legacy .next release volume there. BYLINE_NEXT_DIST_DIR is
# already the supported Next config override, so the image can ignore that
# legacy volume while remaining compatible with the current host configuration.
ARG BYLINE_BUILD_SHA=unknown
ENV BYLINE_NEXT_DIST_DIR=.byline-prebuilt-next
RUN --mount=type=secret,id=byline_build_database_url,required=true \
    --mount=type=secret,id=byline_build_payload_secret,required=true \
    DATABASE_URL="$(cat /run/secrets/byline_build_database_url)" \
    PAYLOAD_SECRET="$(cat /run/secrets/byline_build_payload_secret)" \
    BYLINE_DB_PUSH=0 \
    npm run build --workspace @byline/newsroom \
    && rm -rf apps/newsroom/.byline-prebuilt-next/cache

LABEL org.opencontainers.image.source="https://github.com/weeklywildcat/byline" \
      org.opencontainers.image.revision="${BYLINE_BUILD_SHA}"

ENV NODE_ENV=production

EXPOSE 3010

CMD ["npm", "run", "start", "--workspace", "@byline/newsroom"]
