FROM node:24.22.1-bookworm-slim

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

# Keep dependency installation in its own cacheable layer. Normal source-only
# deploys should not re-run npm ci; changing package-lock.json or any workspace
# manifest intentionally invalidates this layer.
COPY package.json package-lock.json ./
COPY apps/discord-bot/package.json ./apps/discord-bot/package.json
COPY apps/newsroom/package.json ./apps/newsroom/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/admin-runtime/package.json ./packages/admin-runtime/package.json
COPY packages/article-body/package.json ./packages/article-body/package.json
COPY packages/content/package.json ./packages/content/package.json
COPY packages/core/package.json ./packages/core/package.json
COPY packages/design/package.json ./packages/design/package.json
COPY packages/editor/package.json ./packages/editor/package.json
COPY packages/mcp-contracts/package.json ./packages/mcp-contracts/package.json
COPY packages/newsroom-screens/package.json ./packages/newsroom-screens/package.json
COPY packages/newsroom-ui/package.json ./packages/newsroom-ui/package.json
COPY packages/story-presentations/package.json ./packages/story-presentations/package.json
COPY packages/theme-contract/package.json ./packages/theme-contract/package.json
COPY packages/theme-weekly-wildcat/package.json ./packages/theme-weekly-wildcat/package.json
COPY packages/ui/package.json ./packages/ui/package.json
COPY wordpress-plugin/package.json ./wordpress-plugin/package.json

RUN --mount=type=cache,target=/root/.npm npm ci

COPY . .

EXPOSE 3010
