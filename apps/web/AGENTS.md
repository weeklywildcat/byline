<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# apps/web

The public Astro site. The root [AGENTS.md](../../AGENTS.md) holds its rules and checks.

Byline is being generalized; see the [plan](../../docs/generalization-plan.md). Weekly Wildcat's own pages, views, brand assets, and analytics will move from this app to a site package (slice 1c). Until then they stay here. `verify-build` and `verify-seo` are the guard for any route change: a route missing from the manifest or an indexable page missing from the sitemap fails the build, and that is correct.
